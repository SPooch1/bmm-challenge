#!/bin/bash
# Rebuilds tests/harness/www/ (gitignored) from public/ + the fake Firebase + seed.js.
# Then: (cd tests/harness/www && python3 -m http.server 8765) and node tests/harness/run.js
set -e
H="$(cd "$(dirname "$0")" && pwd)"
R="$(cd "$H/../.." && pwd)"
rm -rf "$H/www" && cp -R "$R/public" "$H/www"
cp "$R/tests/rules-model.js" "$R/tests/fake-firebase.js" "$H/seed.js" "$H/www/js/"
mkdir -p "$H/www/tools" && cp "$R/tools/migrate-core.js" "$H/www/tools/"
for f in index.html dashboard.html; do
  python3 - "$H/www/$f" <<'PY'
import sys,re
p=sys.argv[1]; s=open(p).read()
s=re.sub(r'\s*<script src="https://www.gstatic.com/firebasejs/[^"]+"></script>','',s)
s=s.replace('<script src="/js/firebase-config.js"></script>','<script src="/js/rules-model.js"></script>\n  <script src="/js/fake-firebase.js"></script>\n  <script src="/js/seed.js"></script>\n  <script src="/js/firebase-config.js"></script>')
open(p,'w').write(s)
PY
done
# no service worker in the harness
echo "" > "$H/www/sw.js"
echo built
