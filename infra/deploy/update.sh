#!/usr/bin/env bash
# Redeploy YuanFen after a push. Run as root:  bash /opt/yuanfen/infra/deploy/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/yuanfen}"
APP_USER="${APP_USER:-yuanfen}"
BRANCH="${BRANCH:-main}"

[ "$(id -u)" -eq 0 ] || { echo "!! run as root"; exit 1; }

git -C "$APP_DIR" fetch --all --prune
git -C "$APP_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm run build -w @yuanfen/web"
[ -f "$APP_DIR/apps/web/dist/index.html" ] || { echo "!! build produced no dist/index.html"; exit 1; }
chmod -R a+rX "$APP_DIR/apps/web/dist"

systemctl restart yuanfen-api
systemctl reload nginx

sleep 2
curl -fsS http://127.0.0.1:8787/api/meta/mode && echo
echo "==> redeployed $(git -C "$APP_DIR" log -1 --format='%h %s')"
