#!/usr/bin/env bash

set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

nvm use 24 >/dev/null

APP_DIR="${APP_DIR:-/srv/artctl}"
SERVICE_NAME="${SERVICE_NAME:-artctl}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
PORT="${PORT:-3000}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:${PORT}/api/health}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-15}"
HEALTHCHECK_DELAY_SECONDS="${HEALTHCHECK_DELAY_SECONDS:-2}"

cd "$APP_DIR"

echo "Deploying branch $DEPLOY_BRANCH in $APP_DIR"

npm ci
npm run build

sudo systemctl restart "$SERVICE_NAME"

for ((attempt = 1; attempt <= HEALTHCHECK_RETRIES; attempt += 1)); do
  if sudo systemctl is-active --quiet "$SERVICE_NAME" && curl --fail --silent "$HEALTHCHECK_URL" >/dev/null; then
    echo "Deploy complete"
    exit 0
  fi

  if [ "$attempt" -lt "$HEALTHCHECK_RETRIES" ]; then
    sleep "$HEALTHCHECK_DELAY_SECONDS"
  fi
done

echo "Deployment health check failed for $HEALTHCHECK_URL"
sudo systemctl status "$SERVICE_NAME" --no-pager || true
sudo journalctl -u "$SERVICE_NAME" -n 50 --no-pager || true
exit 1
