#!/usr/bin/env bash
# YuanFen — one-shot ECS bootstrap. Run as root on the Alibaba Cloud ECS box.
# Installs Node + nginx, clones the repo, builds the web bundle, and wires up
# the Fastify API as a systemd service behind nginx on port 80.
#
#   curl -fsSL https://raw.githubusercontent.com/TripleHHH-ui/YuanFen/main/infra/deploy/bootstrap.sh | bash
#
# Re-runnable: a second run updates the checkout and restarts cleanly.
set -euo pipefail

REPO="${REPO:-https://github.com/TripleHHH-ui/YuanFen.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/yuanfen}"
APP_USER="${APP_USER:-yuanfen}"
NODE_MAJOR="${NODE_MAJOR:-22}"

[ "$(id -u)" -eq 0 ] || { echo "!! run this as root (sudo -i)"; exit 1; }

. /etc/os-release
echo "==> OS: ${PRETTY_NAME:-$ID}"

echo "==> installing node ${NODE_MAJOR}, nginx, git"
case "$ID" in
  ubuntu|debian)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y curl ca-certificates gnupg git nginx
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
    ;;
  alinux|anolis|centos|rhel|almalinux|rocky|openEuler)
    PKG=dnf; command -v dnf >/dev/null 2>&1 || PKG=yum
    $PKG install -y curl ca-certificates git nginx
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    $PKG install -y nodejs
    ;;
  *)
    echo "!! unsupported distro '$ID' — install node ${NODE_MAJOR}, nginx and git by hand, then re-run"
    exit 1
    ;;
esac
echo "==> node $(node -v), npm $(npm -v)"

echo "==> app user: $APP_USER"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"

echo "==> syncing $REPO ($BRANCH) -> $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" remote set-url origin "$REPO"
  git -C "$APP_DIR" fetch --all --prune
  git -C "$APP_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# playwright is a dev-only dependency here; skip its ~500MB browser download
echo "==> npm install + web build (this is the slow part, ~2-4 min)"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm run build -w @yuanfen/web"
[ -f "$APP_DIR/apps/web/dist/index.html" ] || { echo "!! build produced no dist/index.html"; exit 1; }

# nginx workers run as a different user; make sure they can traverse to dist/
chmod o+x "$APP_DIR" "$APP_DIR/apps" "$APP_DIR/apps/web"
chmod -R a+rX "$APP_DIR/apps/web/dist"

echo "==> systemd unit: yuanfen-api"
cat >/etc/systemd/system/yuanfen-api.service <<UNIT
[Unit]
Description=YuanFen API (Fastify)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=ATLAS_MODE=fixture
Environment=API_PORT=8787
ExecStart=$APP_DIR/node_modules/.bin/tsx $APP_DIR/apps/api/src/server.ts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable yuanfen-api
systemctl restart yuanfen-api

echo "==> nginx"
if id -u nginx >/dev/null 2>&1; then NGINX_USER=nginx; else NGINX_USER=www-data; fi
[ -f /etc/nginx/nginx.conf ] && [ ! -f /etc/nginx/nginx.conf.yuanfen-bak ] \
  && cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.yuanfen-bak
rm -f /etc/nginx/sites-enabled/default

cat >/etc/nginx/nginx.conf <<'NGINX'
user __NGINX_USER__;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /run/nginx.pid;

events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    access_log    /var/log/nginx/access.log;
    sendfile      on;
    keepalive_timeout 65;

    gzip on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    server {
        listen 80 default_server;
        server_name _;

        root  /opt/yuanfen/apps/web/dist;
        index index.html;

        location /api/ {
            proxy_pass http://127.0.0.1:8787;
            proxy_http_version 1.1;
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_read_timeout 120s;
        }

        # SPA fallback — deep links land on index.html
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
NGINX
sed -i "s/__NGINX_USER__/$NGINX_USER/" /etc/nginx/nginx.conf

# SELinux (Alibaba Cloud Linux) blocks nginx -> localhost proxying when enforcing
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  setsebool -P httpd_can_network_connect 1 || true
fi

# host firewall, if one is active (the ECS security group is separate — open 80 there too)
if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http && firewall-cmd --reload
fi

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> smoke test"
sleep 2
curl -fsS http://127.0.0.1:8787/api/meta/mode && echo
curl -fsSI http://127.0.0.1/ | head -1

IP="$(curl -fsS --max-time 5 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null \
   || curl -fsS --max-time 5 http://100.100.100.200/latest/meta-data/public-ipv4 2>/dev/null || true)"
echo
echo "=============================================="
echo " YuanFen is up:  http://${IP:-<your-ecs-public-ip>}/"
echo "=============================================="
echo " logs:    journalctl -u yuanfen-api -f"
echo " restart: systemctl restart yuanfen-api nginx"
echo " redeploy after a push: bash $APP_DIR/infra/deploy/update.sh"
