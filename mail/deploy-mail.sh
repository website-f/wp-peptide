#!/usr/bin/env bash
# Deploys / updates the KYVO mail stack on the VPS. Run from /opt/kyvo/mail:
#
#   ./deploy-mail.sh
#
# Safe to re-run. First run also: creates mail/.env, the orxies site for the mail
# hostname (Let's Encrypt certificate), the admin/support/noreply mailboxes, the
# postmaster/abuse/dmarc forwarders and the DKIM key, opens the mail ports, and
# points the store's SMTP settings at noreply@. Passwords are printed once.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
C="docker compose"

# ---------- 1. mail/.env ----------
if [ ! -f .env ]; then
  cp .env.example .env
  IP="$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
  sed -i "s/^SERVER_IP=.*/SERVER_IP=${IP}/" .env
  sed -i "s/^ROUNDCUBE_DES_KEY=.*/ROUNDCUBE_DES_KEY=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 24)/" .env
  chmod 600 .env
  echo "Created mail/.env (SERVER_IP=${IP})"
fi
set -a; . ./.env; set +a

# ---------- 2. TLS certificate for the mail hostname (issued by orxies) ----------
SITE="/opt/orxies/sites/${MAIL_HOSTNAME}.yml"
if [ ! -f "$SITE" ]; then
  KPORT="$(grep -E '^KYVO_PORT=' "$ROOT/.env" | cut -d= -f2 || true)"
  cat > "$SITE" <<EOF
# Mail server name for ${MAIL_DOMAIN} (MX / IMAP / SMTP). Exists so orxies keeps a Let's Encrypt
# certificate for it (used by the mail server); in a browser it opens webmail.
domain: ${MAIL_HOSTNAME}
upstreams:
  - 127.0.0.1:${KPORT:-8600}
enabled: true
tls:
  auto: true
http_to_https: true
websocket: true
block_common_exploits: true
rate_limit:
  enabled: true
  rps: 30
  burst: 60
custom_headers:
  Strict-Transport-Security: "max-age=31536000"
  X-Content-Type-Options: "nosniff"
EOF
  echo "Added orxies site ${SITE}; requesting the certificate..."
  curl -s -o /dev/null --max-time 20 "https://${MAIL_HOSTNAME}/" -k || true
fi
for _ in $(seq 1 60); do
  [ -s "${CERT_DIR}/${MAIL_HOSTNAME}.crt" ] && [ -s "${CERT_DIR}/${MAIL_HOSTNAME}.key" ] && break
  curl -s -o /dev/null --max-time 10 "https://${MAIL_HOSTNAME}/" -k || true
  sleep 5
done
[ -s "${CERT_DIR}/${MAIL_HOSTNAME}.crt" ] || { echo "FAILED: no certificate for ${MAIL_HOSTNAME} in ${CERT_DIR}. Does ${MAIL_HOSTNAME} point at this server?"; exit 1; }

# ---------- 3. firewall ----------
if command -v ufw >/dev/null && ufw status | grep -q active; then
  for p in 25 465 587 993; do ufw allow "${p}/tcp" >/dev/null; done
fi

# ---------- 4. start ----------
mkdir -p data/config data/mail data/state data/logs data/panel data/roundcube/db
FIRST=0
[ -s data/config/postfix-accounts.cf ] || FIRST=1
$C up -d --build --remove-orphans

for _ in $(seq 1 40); do
  $C exec -T mailserver true 2>/dev/null && break
  sleep 3
done

gen() { openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 18 | sed -E 's/(.{6})(.{6})(.{6})/\1-\2-\3/'; }

if [ "$FIRST" = 1 ]; then
  echo
  echo "================ First-time mail setup ================"
  declare -A PW
  for u in admin support noreply; do
    PW[$u]="$(gen)"
    $C exec -T mailserver setup email add "${u}@${MAIL_DOMAIN}" "${PW[$u]}" </dev/null
  done
  for a in postmaster abuse dmarc; do
    $C exec -T mailserver setup alias add "${a}@${MAIL_DOMAIN}" "admin@${MAIL_DOMAIN}" </dev/null
  done
  for u in admin support; do $C exec -T mailserver setup quota set "${u}@${MAIL_DOMAIN}" 5G </dev/null; done
  $C exec -T mailserver setup quota set "noreply@${MAIL_DOMAIN}" 1G </dev/null

  # The store sends its notifications as noreply@ through this server (by its public name, TLS verified).
  ENVF="$ROOT/.env"
  sed -i '/^SMTP_\(HOST\|PORT\|USER\|PASS\|FROM\|TLS_REJECT_UNAUTHORIZED\)=/d' "$ENVF"
  {
    echo "SMTP_HOST=${MAIL_HOSTNAME}"
    echo "SMTP_PORT=587"
    echo "SMTP_USER=noreply@${MAIL_DOMAIN}"
    echo "SMTP_PASS=${PW[noreply]}"
    echo "SMTP_FROM=KYVO Labs <noreply@${MAIL_DOMAIN}>"
  } >> "$ENVF"

  echo " Mailboxes (passwords shown only now; change them in /mail):"
  for u in admin support noreply; do echo "   ${u}@${MAIL_DOMAIN}  ${PW[$u]}"; done
  echo " Forwarders: postmaster@, abuse@, dmarc@ -> admin@${MAIL_DOMAIN}"
  echo " Store SMTP settings written to ${ENVF} (noreply@)."
  echo "======================================================="
fi

# ---------- 5. DKIM ----------
if ! ls data/config/rspamd/dkim/*-"${DKIM_SELECTOR:-mail}"-"${MAIL_DOMAIN}".private.txt >/dev/null 2>&1; then
  $C exec -T mailserver setup config dkim keysize 2048 selector "${DKIM_SELECTOR:-mail}" domain "${MAIL_DOMAIN}" </dev/null
fi
# Sign from day one, even before the DKIM record is visible in DNS (the key is ours).
if grep -q '^check_pubkey = true' data/config/rspamd/override.d/dkim_signing.conf 2>/dev/null; then
  sed -i 's/^check_pubkey = true;.*/check_pubkey = false; # sign even before the DNS record is visible (key is ours)/' data/config/rspamd/override.d/dkim_signing.conf
fi

# ---------- 6. backup of accounts + DKIM key (mail itself: back up data/mail) ----------
mkdir -p "$ROOT/backups"
tar -czf "$ROOT/backups/mail-config-$(date +%Y%m%d-%H%M%S).tgz" -C data config panel
find "$ROOT/backups" -name 'mail-config-*.tgz' -mtime +30 -delete

# ---------- 7. report ----------
PANEL_PW="$($C logs panel 2>/dev/null | grep -m1 'password:' | awk '{print $2}' || true)"
[ "$FIRST" = 1 ] && [ -n "$PANEL_PW" ] && echo " Mail panel (/mail): username admin, password ${PANEL_PW} (change it under Panel Password)"
echo
echo "DKIM record (TXT ${DKIM_SELECTOR:-mail}._domainkey.${MAIL_DOMAIN}):"
cat data/config/rspamd/dkim/*-"${DKIM_SELECTOR:-mail}"-"${MAIL_DOMAIN}".public.dns.txt 2>/dev/null || true
echo
$C ps --format '{{.Service}}  {{.Status}}'
echo "Mail stack deployed. Now run ../deploy/deploy-vps.sh so the store joins it."
