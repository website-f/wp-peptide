#!/usr/bin/env bash
# Deploy the latest main to the VPS (run on the server, from /opt/kyvo).
#
#   ./deploy/deploy-vps.sh            backup -> pull -> build -> up -> health check
#   nohup ./deploy/deploy-vps.sh > /tmp/kyvo-deploy.log 2>&1 &
#
# Never run a bare `docker compose up` here: it would drop docker-compose.vps.yml
# (localhost-only ports, secure cookies, no demo seeding).
set -euo pipefail
cd "$(dirname "$0")/.."

C="docker compose -f docker-compose.yml -f docker-compose.vps.yml"
# With the mail stack running (mail/deploy-mail.sh), the store joins its network for /mail, /webmail and SMTP.
if docker network inspect kyvo-mail >/dev/null 2>&1; then C="$C -f docker-compose.mail.yml"; fi
PORT="$(grep -E '^KYVO_PORT=' .env | cut -d= -f2 || true)"
PORT="${PORT:-8600}"

# 0. The key that encrypts payment-gateway keys in the database (generated once, never rotated by this script).
if ! grep -qE '^DATA_ENCRYPTION_KEY=.+' .env; then
  sed -i '/^DATA_ENCRYPTION_KEY=$/d' .env
  printf '\nDATA_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" >> .env
  echo "Generated DATA_ENCRYPTION_KEY in .env. Keep a copy of .env somewhere safe."
fi

# 1. Database backup (kept 14 days). Restore: gunzip -c FILE | $C exec -T db psql -U kyvo -d kyvo
mkdir -p backups
if $C ps --status running db 2>/dev/null | grep -q db; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  $C exec -T db pg_dump -U kyvo -d kyvo --no-owner | gzip > "backups/kyvo-$STAMP.sql.gz"
  find backups -name 'kyvo-*.sql.gz' -mtime +14 -delete
  echo "Backup: backups/kyvo-$STAMP.sql.gz"
fi

# 2. Code
BEFORE="$(git rev-parse --short HEAD)"
git pull --ff-only
AFTER="$(git rev-parse --short HEAD)"
echo "Code: $BEFORE -> $AFTER"

# 3. Build and roll (migrations run in the api entrypoint)
$C build
$C up -d --remove-orphans

# 4. Health
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null; then break; fi
  sleep 3
done
curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null || { echo "FAILED: health check on 127.0.0.1:$PORT"; $C logs --tail 50 api; exit 1; }

# 5. Nothing of ours may listen publicly; the proxy (orxies) owns 80/443.
if ss -tlnp | awk 'NR>1{print $4}' | grep -E ":($PORT|8601|5432)\$" | grep -vqE '^(127\.0\.0\.1|\[::1\]):'; then
  echo "FAILED: a KYVO port is exposed publicly"; exit 1
fi

if grep -qE '^TOYYIBPAY_(SECRET_KEY|CATEGORY_CODE)=.+' .env; then
  echo "NOTE: ToyyibPay keys are still in .env. They are managed in Admin > Settings now (imported once); delete the TOYYIBPAY_* lines."
fi

$C ps --format '{{.Name}}  {{.Status}}'
echo "Deployed $AFTER"
