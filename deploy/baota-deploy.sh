#!/usr/bin/env bash
# Copy this script outside the public/runtime directory before enabling WebHook.
set -Eeuo pipefail
umask 027
CONFIG=${GROW_DEPLOY_CONFIG:-/www/deploy/grow/deploy.env}
[[ -f "$CONFIG" ]] || { echo "Missing private deployment configuration" >&2; exit 1; }
source "$CONFIG"
: "${PYTHON_BIN:?Set the existing BaoTa virtualenv Python path}"
: "${CONTROL_SCRIPT:?Set an executable local script accepting stop/start}"
APP_DIR=/www/wwwroot/grow
WORK_DIR=/www/deploy/grow
REPO_URL=https://github.com/franz-9527/grow.git
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8010/health}
export PATH="${NODE_BIN_DIR:-/usr/local/bin}:$PATH"
[[ -x "$PYTHON_BIN" && -x "$CONTROL_SCRIPT" && -d "$APP_DIR" && -d "$WORK_DIR" ]]
[[ ! -L "$APP_DIR" && ! -L "$APP_DIR/app" && ! -L "$APP_DIR/static" ]]
for tool in git npm node flock rsync tar curl; do command -v "$tool" >/dev/null; done
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<13)) process.exit(1)'
"$PYTHON_BIN" -c 'import sys; assert sys.version_info >= (3,10)'
exec 9>"$WORK_DIR/deploy.lock"
flock -w 1200 9 || { echo "Another deployment is still running" >&2; exit 1; }
# Each invocation checks the current main branch. Payload values never become commands.
STAGE=$(mktemp -d "$WORK_DIR/build.XXXXXXXX")
trap 'echo "Deployment failed at line $LINENO; staging retained: $STAGE" >&2' ERR
git clone --depth 1 --branch main --single-branch "$REPO_URL" "$STAGE/source"
SOURCE="$STAGE/source"
SHA=$(git -C "$SOURCE" rev-parse HEAD)
if [[ -f "$WORK_DIR/deployed-sha" ]] && [[ $(cat "$WORK_DIR/deployed-sha") == "$SHA" ]]; then
  echo "Already deployed: $SHA"; exit 0
fi
cd "$SOURCE/frontend"
npm ci --no-audit --no-fund
npm run build
[[ -s dist/client/index.html ]]
"$PYTHON_BIN" -m compileall -q "$SOURCE/backend/app"
# Keep existing credentials and data. Refuse to silently initialize a new garden.
[[ -f "$APP_DIR/.env" && -f "$APP_DIR/data/grow.db" ]] || {
  echo "Existing .env and data/grow.db required; configure a fresh install manually" >&2; exit 1;
}
BACKUP="$WORK_DIR/backups/$(date -u +%Y%m%dT%H%M%SZ)-${SHA:0:12}"
mkdir -p "$BACKUP"
"$PYTHON_BIN" "$SOURCE/backend/manage_db.py" "$APP_DIR/data/grow.db" --backup "$BACKUP/grow.db"
tar -czf "$BACKUP/code.tar.gz" -C "$APP_DIR" app static requirements.txt
"$PYTHON_BIN" -m pip install -r "$SOURCE/backend/requirements.txt"
"$CONTROL_SCRIPT" stop
# Restart on copy failure too, so a failed update does not silently leave it stopped.
trap 'status=$?; if (( status != 0 )); then "$CONTROL_SCRIPT" start || true; echo "Deployment failed. Backup: $BACKUP; staging: $STAGE" >&2; fi' EXIT
mkdir -p "$APP_DIR/app" "$APP_DIR/static/client"
rsync -a --delete --exclude='__pycache__/' "$SOURCE/backend/app/" "$APP_DIR/app/"
rsync -a --delete "$SOURCE/frontend/dist/client/" "$APP_DIR/static/client/"
cp "$SOURCE/backend/requirements.txt" "$SOURCE/backend/manage_db.py" "$APP_DIR/"
if [[ -n ${RUN_USER:-} ]]; then
  chown -R "$RUN_USER:$RUN_USER" "$APP_DIR/app" "$APP_DIR/static/client"
fi
"$CONTROL_SCRIPT" start
for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" | "$PYTHON_BIN" -c 'import json,sys; assert json.load(sys.stdin).get("status")=="ok"'; then
    printf '%s\n' "$SHA" > "$WORK_DIR/deployed-sha"
    echo "Deployed $SHA; backup: $BACKUP"; exit 0
  fi
  sleep 2
done
echo "Health check failed. Inspect logs; backup: $BACKUP. Database is never automatically restored." >&2
exit 1
