#!/usr/bin/env python3
"""Quick deploy of the core (backend, app, manual, kiosk frontend, scripts) to a test box - seconds instead of a full update.

    python tools/deploy-core.py <ip> [target ...] [--no-build] [--quick] [--dry-run] [--restart-player | --restart-when-idle]

Targets (default: backend scripts):
  server    server.js, nas-smb-helper.js, templates/   -> the server folder         (restarts the server)
  app       mupi-app/ (the web app and its i18n)        -> the server folder         (restarts the server)
  manual    manual/                                     -> the server folder
  backend   = server + app + manual
  www       the kiosk frontend (Angular)                -> server folder/www         (keeps theme-data and active_theme.css)
  scripts   scripts/mupibox/                            -> /usr/local/bin/mupibox    (as root, line endings fixed)
  player    spotify-control.js (the player, built)      -> ~/.mupibox/player         (takes effect when the player restarts:
                                                          --restart-player now, --restart-when-idle once nothing plays - a restart
                                                          stops what plays)
  all       = backend + www + scripts + player

Builds what the targets need first (npm run build:fast in backend-api: no type check with --quick; build:frontend-box for www),
unless --no-build. Then compares sha256 of every file with the box and sends only what differs (one tar over one ssh stream),
removes files that are gone (not in www/assets and theme-data). Needs the ssh key ~/.ssh/mupibox_testbox, user dietpi, sudo.
This does NOT replace a core update for changes to config/, services, update script, apt packages or migrations.
"""
import argparse
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEPLOY = os.path.join(ROOT, 'src', 'deploy')
SERVER = '/home/dietpi/.mupibox/Sonos-Kids-Controller-master'
BIN = '/usr/local/bin/mupibox'
PLAYER = '/home/dietpi/.mupibox/player'
KEYS = [os.environ['MUPIBOX_KEY']] if os.environ.get('MUPIBOX_KEY') else [os.path.expanduser('~/.ssh/' + name) for name in ('mupibox_testbox', 'mupibox_pi5')]
SSH = ['ssh', '-i', KEYS[0], '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8']


def choose_key(host):
    """The first key of the known ones that the box accepts (MUPIBOX_KEY names one)."""
    for key in KEYS:
        probe = subprocess.run(['ssh', '-i', key, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', f'dietpi@{host}', 'true'], capture_output=True)
        if probe.returncode == 0:
            SSH[2] = key
            return
    sys.exit(f'no ssh key is accepted by {host} (set MUPIBOX_KEY)')

TEXT_EXT = ('.sh', '.py', '.service', '.conf', '.json', '.txt')
WWW_BUILD_FILE = re.compile(r'^[^/]+-[A-Z0-9]{8}\.(js|css)$|^(index\.html|favicon\.ico|3rdpartylicenses\.txt)$')


def walk(directory):
    for base, dirs, files in os.walk(directory):
        dirs[:] = sorted(d for d in dirs if d != '__pycache__')
        for name in sorted(files):
            full = os.path.join(base, name)
            yield os.path.relpath(full, directory).replace(os.sep, '/'), full


class Target:
    """A set of local files that belong on the box under `base`; `rel` paths are relative to `base`."""

    def __init__(self, name, base, files, root=False, exe=False, delete=None, strip_cr=False, restart=False):
        self.name, self.base, self.files = name, base, files
        self.root, self.exe, self.strip_cr, self.restart = root, exe, strip_cr, restart
        self.delete = delete  # function(rel) -> may a file that is gone locally be removed on the box? None: never
        self.roots = sorted({rel.split('/')[0] for rel in files})


def read_bytes(path, strip_cr):
    data = open(path, 'rb').read()
    return data.replace(b'\r\n', b'\n') if strip_cr else data


def make_targets(names):
    out = []
    if 'server' in names:
        files = {}
        for f in ('server.js', 'nas-smb-helper.js'):
            files[f] = os.path.join(DEPLOY, f)
        for rel, full in walk(os.path.join(DEPLOY, 'templates')):
            files['templates/' + rel] = full
        out.append(Target('server', SERVER, files, restart=True))
    for name in ('app', 'manual'):
        if name in names:
            folder = 'mupi-app' if name == 'app' else 'manual'
            files = {folder + '/' + rel: full for rel, full in walk(os.path.join(DEPLOY, folder))}
            out.append(Target(name, SERVER, files, delete=lambda rel: True, restart=(name == 'app')))
    if 'www' in names:
        src = os.path.join(DEPLOY, 'www', 'browser')
        files = {'www/' + rel: full for rel, full in walk(src)}
        # only the hashed build files at the top may be removed; assets/, theme-data/ and active_theme.css stay
        out.append(Target('www', SERVER, files, delete=lambda rel: bool(WWW_BUILD_FILE.match(rel[len('www/'):]))))
    if 'player' in names:
        out.append(Target('player', PLAYER, {'spotify-control.js': os.path.join(DEPLOY, 'spotify-control.js')}))
    if 'scripts' in names:
        src = os.path.join(ROOT, 'scripts', 'mupibox')
        files = {rel: full for rel, full in walk(src) if not rel.startswith('test_')}
        out.append(Target('scripts', BIN, files, root=True, exe=True, strip_cr=True))
    return out


def run(cmd, cwd, label):
    print(f'== {label}', flush=True)
    start = time.time()
    shell = os.name == 'nt'
    res = subprocess.run(cmd, cwd=cwd, shell=shell)
    if res.returncode:
        sys.exit(f'{label} failed (exit {res.returncode})')
    print(f'   ({time.time() - start:.0f} s)', flush=True)


def build(names, quick):
    if names & {'server', 'app', 'manual'}:
        run('npm run ' + ('build:fast' if quick else 'build') + ' --workspace=mupibox-backend-api', ROOT, 'build backend-api' + (' (no type check)' if quick else ''))
    if 'www' in names:
        run('npm run build:frontend-box', ROOT, 'build frontend-box')
    if 'player' in names:
        run('npm run build --workspace=mupibox-backend-player', ROOT, 'build backend-player')


LIST_SCRIPT = r'''
import hashlib, json, os, sys
plan = json.load(sys.stdin)
out = {}
for t in plan:
    for root in t['roots']:
        path = os.path.join(t['base'], root)
        paths = []
        if os.path.isdir(path):
            for base, dirs, files in os.walk(path):
                dirs[:] = [d for d in dirs if d != '__pycache__']
                paths += [os.path.join(base, f) for f in files]
        elif os.path.isfile(path):
            paths.append(path)
        for p in paths:
            rel = os.path.relpath(p, t['base']).replace(os.sep, '/')
            try:
                out.setdefault(t['name'], {})[rel] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
            except OSError:
                pass
json.dump(out, sys.stdout)
'''

APPLY_SCRIPT = r'''
import json, os, shutil, sys
stage, as_root = sys.argv[1], sys.argv[2] == 'root'
plan = json.load(open(os.path.join(stage, 'plan.json')))
for t in plan:
    if t['root'] != as_root:
        continue
    for rel in t['changed']:
        dst = os.path.join(t['base'], rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        tmp = dst + '.deploy-new'
        shutil.copyfile(os.path.join(stage, 'files', t['name'], rel), tmp)
        os.chmod(tmp, 0o755 if t['exe'] else 0o644)
        os.replace(tmp, dst)
    for rel in t['deleted']:
        try:
            os.remove(os.path.join(t['base'], rel))
        except OSError:
            pass
    print('  %s: %d sent, %d removed' % (t['name'], len(t['changed']), len(t['deleted'])))
'''


def ssh(host, remote, data=None):
    res = subprocess.run(SSH + [f'dietpi@{host}', remote], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    err = '\n'.join(l for l in res.stderr.decode(errors='replace').splitlines() if not l.startswith('TERM environment'))
    if res.returncode:
        sys.exit(f'ssh failed ({res.returncode}): {err}')
    return res.stdout


# Waits until nothing plays any more (not playing, not paused, not loading: twice in a row), restarts the player and removes itself.
WAIT_SCRIPT = r'''#!/bin/bash
log=/tmp/restart-when-idle.log
idle=0
for i in $(seq 1 480); do
  s=$(curl -s -m 5 localhost:5005/local | python3 -c "import json,sys;d=json.load(sys.stdin);print('busy' if (d.get('playing') or d.get('pause') or d.get('loading')) else 'idle')" 2>/dev/null || echo unknown)
  if [ "$s" = idle ]; then idle=$((idle+1)); else idle=0; fi
  if [ $idle -ge 2 ]; then
    pm2 restart spotify-control >> $log 2>&1 && echo "$(date '+%F %T') restarted spotify-control" >> $log
    rm -f /tmp/restart-when-idle.sh; exit 0
  fi
  sleep 30
done
echo "$(date '+%F %T') gave up: still busy after 4 h" >> $log
rm -f /tmp/restart-when-idle.sh
'''


def restart_player(host, now):
    if now:
        ssh(host, 'pm2 restart spotify-control >/dev/null && echo "player restarted"')
        print('player restarted')
        return
    script = 'cat > /tmp/restart-when-idle.sh && chmod +x /tmp/restart-when-idle.sh && rm -f /tmp/restart-when-idle.log && (nohup /tmp/restart-when-idle.sh >/dev/null 2>&1 < /dev/null &) ; sleep 1; pgrep -f restart-when-idle.sh | head -1'
    ssh(host, script, WAIT_SCRIPT.encode())
    print('player: restarts once nothing plays any more (log: /tmp/restart-when-idle.log on the box)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ip')
    ap.add_argument('targets', nargs='*')
    ap.add_argument('--no-build', action='store_true')
    ap.add_argument('--quick', action='store_true', help='skip the type check of the backend build')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--restart-player', action='store_true', help='restart the player after sending it (stops what plays)')
    ap.add_argument('--restart-when-idle', action='store_true', help='restart the player once nothing plays any more (a box-side script waits for it; up to 4 hours)')
    args = ap.parse_args()

    groups = {'backend': {'server', 'app', 'manual'}, 'all': {'server', 'app', 'manual', 'www', 'scripts', 'player'}}
    names = set()
    for t in args.targets or ['backend', 'scripts']:
        names |= groups.get(t, {t})
    unknown = names - {'server', 'app', 'manual', 'www', 'scripts', 'player'}
    if unknown:
        sys.exit('unknown target: ' + ', '.join(sorted(unknown)))

    if not args.no_build:
        build(names, args.quick)
    targets = make_targets(names)
    for t in targets:
        if not t.files:
            sys.exit(f'nothing built for {t.name} (run without --no-build)')

    t0 = time.time()
    choose_key(args.ip)
    listing = json.loads(ssh(args.ip, 'python3 -c "$(cat <<\'EOF\'\n' + LIST_SCRIPT + '\nEOF\n)" <<\'JSON\'\n' + json.dumps([{'name': t.name, 'base': t.base, 'roots': t.roots} for t in targets]) + '\nJSON\n').decode())

    plan, payload = [], io.BytesIO()
    restart = False
    with tarfile.open(fileobj=payload, mode='w') as tar:
        for t in targets:
            remote = listing.get(t.name, {})
            changed, local_hash = [], {}
            for rel, full in t.files.items():
                data = read_bytes(full, t.strip_cr)
                local_hash[rel] = hashlib.sha256(data).hexdigest()
                if remote.get(rel) != local_hash[rel]:
                    changed.append(rel)
                    info = tarfile.TarInfo(f'files/{t.name}/{rel}')
                    info.size, info.mtime, info.mode = len(data), int(time.time()), 0o644
                    tar.addfile(info, io.BytesIO(data))
            deleted = [rel for rel in remote if rel not in t.files and t.delete and t.delete(rel)]
            print(f'{t.name}: {len(changed)} of {len(t.files)} files differ, {len(deleted)} to remove')
            if args.dry_run:
                for rel in changed[:15]:
                    print('   +', rel)
                for rel in deleted[:15]:
                    print('   -', rel)
            if t.restart and changed:
                restart = True
            plan.append({'name': t.name, 'base': t.base, 'root': t.root, 'exe': t.exe, 'changed': changed, 'deleted': deleted})
        for name, data in (('plan.json', json.dumps(plan).encode()), ('apply.py', APPLY_SCRIPT.encode())):
            info = tarfile.TarInfo(name)
            info.size, info.mtime, info.mode = len(data), int(time.time()), 0o644
            tar.addfile(info, io.BytesIO(data))

    if args.dry_run or not any(p['changed'] or p['deleted'] for p in plan):
        print('dry run, nothing sent' if args.dry_run else 'the box is up to date')
        return
    needs_root = any(p['root'] and (p['changed'] or p['deleted']) for p in plan)
    remote_cmd = ('d=$(mktemp -d) && tar -C "$d" -xf - && python3 "$d/apply.py" "$d" user'
                  + (' && sudo python3 "$d/apply.py" "$d" root' if needs_root else '')
                  + ('; rc=$?; rm -rf "$d"; [ $rc = 0 ] && pm2 restart server >/dev/null && echo "  server restarted"' if restart else '; rc=$?; rm -rf "$d"; exit $rc'))
    print(ssh(args.ip, remote_cmd, payload.getvalue()).decode(), end='')

    if 'www' in names:
        built = sorted(f for f in os.listdir(os.path.join(DEPLOY, 'www', 'browser')) if f.startswith('main-'))
        served = ''
        for _ in range(15):
            served = ssh(args.ip, "curl -s localhost:8200/ | grep -o 'main-[A-Z0-9]*\\.js' | head -1; true").decode().strip()
            if served:
                break
            time.sleep(2)
        print(f'www: serves {served or "nothing yet"}, built {built[0] if built else "?"}' + ('' if served in built else '  <-- MISMATCH'))
    if 'player' in names and (args.restart_player or args.restart_when_idle):
        restart_player(args.ip, now=args.restart_player)
    elif 'player' in names and any(p['name'] == 'player' and p['changed'] for p in plan):
        print('player: sent, it runs the new file after its next restart (--restart-player, or --restart-when-idle)')
    print(f'done in {time.time() - t0:.1f} s' + (' (after the build)' if not args.no_build else ''))


if __name__ == '__main__':
    main()
