#!/usr/bin/env python3
"""Pack src/deploy into bin/nodejs/deploy.zip with forward-slash entry names (what the update script and unzip on the box
expect: it looks for " mupi-app/index.html"). PowerShell 5.1's Compress-Archive writes backslashes - do not use it for this.

Run from the repository root after `npm run build`:  python tools/make-deploy-zip.py
"""
import os
import sys
import zipfile

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'src', 'deploy')
out = os.path.join(root, 'bin', 'nodejs', 'deploy.zip')

if not os.path.isfile(os.path.join(src, 'mupi-app', 'index.html')):
    sys.exit('src/deploy is not built (mupi-app/index.html missing): run `npm run build` first')

tmp = out + '.new'
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for base, dirs, files in os.walk(src):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(base, name)
            arc = os.path.relpath(full, src).replace(os.sep, '/')
            # The Angular build puts the app into www/browser (and build notes beside it); the box serves it from www/.
            if arc in ('www/3rdpartylicenses.txt', 'www/prerendered-routes.json'):
                continue
            if arc.startswith('www/browser/'):
                arc = 'www/' + arc[len('www/browser/'):]
            z.write(full, arc)
os.replace(tmp, out)
print(f'{out}: {os.path.getsize(out)} bytes')
