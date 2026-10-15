# KYVO mail

Self-hosted email for the store's domain, on the same VPS.

| | |
|---|---|
| Mail server | [docker-mailserver](https://docker-mailserver.github.io/docker-mailserver/latest/) 16 (Postfix + Dovecot + Rspamd). SMTP 25/465/587, IMAP 993. Spam filtering, DKIM signing, Fail2Ban, quotas. IPv4 only (the VPS has no working IPv6). |
| `/mail` | Control panel in `panel/` (cPanel-style): Email Accounts (create, password, storage, delete), Forwarders, Track Delivery (from the Postfix log), Email Deliverability (live DNS check of A, MX, SPF, DKIM, DMARC, PTR), Connect Devices. |
| `/webmail` | Roundcube 1.7 (the same webmail cPanel ships). Sign in with the full address or just the name. |
| Store emails | The API sends as `noreply@` through this server on port 587 (TLS verified against the real certificate). Replies go to the support address set in Admin > Settings. |

The store's nginx serves `/mail` and `/webmail` by joining the `kyvo-mail` Docker network (`../docker-compose.mail.yml`). `mail.<domain>` opens webmail in a browser.

## Deploy (VPS)

```bash
cd /opt/kyvo && git pull --ff-only
cd mail && ./deploy-mail.sh        # mail stack (first run prints all passwords once)
cd .. && ./deploy/deploy-vps.sh    # store joins the mail network, picks up SMTP settings
```

The first run creates `admin@`, `support@` and `noreply@` mailboxes, forwards `postmaster@`, `abuse@` and `dmarc@` to `admin@`, generates the 2048-bit DKIM key and opens ports 25/465/587/993. The TLS certificate for `mail.<domain>` is issued and renewed by orxies; the mail server reloads it automatically.

Panel password lost: `docker compose exec panel npm run reset-password`.

## DNS (at the domain's DNS host) and reverse DNS (at the VPS host)

The panel's **Email Deliverability** page lists the exact records and shows which ones are live. Reverse DNS (PTR) for the server IP must be `mail.<domain>`; it is set in the VPS provider's control panel, not in the domain DNS.

## Data and backups

Everything lives in `mail/data/` (never in git): `mail/` (mailboxes), `config/` (accounts, forwarders, quotas, DKIM key), `state/`, `logs/`, `panel/`, `roundcube/`. Each deploy saves `config/` + `panel/` to `../backups/mail-config-*.tgz` (30 days). Back up `data/mail/` with your server backups.

## Local testing (Windows)

```bash
cd mail
cp .env.example .env    # CERT_DIR=./data/certs-local, COOKIE_SECURE=false, MAIL_TLS_MODE=insecure
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=mail.kyvomethod.com" \
  -keyout data/certs-local/mail.kyvomethod.com.key -out data/certs-local/mail.kyvomethod.com.crt
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
cd .. && docker compose -f docker-compose.yml -f docker-compose.mail.yml up -d   # SMTP_TLS_REJECT_UNAUTHORIZED=false in .env
```
