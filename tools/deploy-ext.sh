#!/usr/bin/env bash
# Quick deploy of one or more extensions from the working tree to a test box (seconds, no update script).
#   tools/deploy-ext.sh <ip> <id> [<id> ...]
# Streams extensions/<id>/ as one tar over a single ssh connection, swaps the folder (old one kept as <id>.old),
# writes the manifest version into state.json and restarts the server once at the end.
# Needs: ssh key ~/.ssh/mupibox_testbox, user dietpi, the extension already installed (state.json entry exists).
set -euo pipefail

ip=${1:?usage: deploy-ext.sh <ip> <id> [<id> ...]}
shift
[ $# -gt 0 ] || { echo "no extension id given" >&2; exit 1; }

root=$(cd "$(dirname "$0")/.." && pwd)
ssh_opts=(-i "$HOME/.ssh/mupibox_testbox" -o IdentitiesOnly=yes -o ConnectTimeout=8 -o BatchMode=yes)

for id in "$@"; do
  [ -f "$root/extensions/$id/manifest.json" ] || { echo "extensions/$id/manifest.json not found" >&2; exit 1; }
done

# One tar stream with all folders (no \r in the scripts: they must run on Linux as they are).
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for id in "$@"; do
  mkdir -p "$tmp/$id"
  tar -C "$root/extensions/$id" --exclude=test --exclude=__pycache__ -cf - . | tar -C "$tmp/$id" -xf -
  find "$tmp/$id" -type f \( -name '*.js' -o -name '*.py' -o -name '*.json' -o -name '*.sh' -o -name '*.rules' -o -name '*.svg' \) -exec sed -i 's/\r$//' {} +
done

# (the remote script travels as a command argument, so stdin stays free for the tar stream)
read -r -d '' remote <<'REMOTE' || true
set -e
cd ~/.mupibox/data/extensions
stage=$(mktemp -d)
tar -C "$stage" -xf -
for id in "$@"; do
  grep -q "\"$id\"" state.json || { echo "$id is not installed on this box (install it once via the extension page first)"; exit 1; }
  ver=$(python3 -c "import json,sys;print(json.load(open('$stage/$id/manifest.json'))['version'])")
  rm -rf "$id.old"
  mv "$id" "$id.old"
  mv "$stage/$id" "$id"
  python3 - "$id" "$ver" <<'PY'
import json, sys
p = 'state.json'
d = json.load(open(p))
d[sys.argv[1]]['version'] = sys.argv[2]
json.dump(d, open(p, 'w'), indent=1)
PY
  echo "deployed $id $ver"
done
rm -rf "$stage"
pm2 restart server >/dev/null
echo "server restarted"
REMOTE

tar -C "$tmp" -cf - "$@" | ssh "${ssh_opts[@]}" "dietpi@$ip" "bash -c $(printf '%q' "$remote") _ $*" 2>&1 | grep -v '^TERM environment'
