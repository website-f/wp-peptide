# KYVO Labs

Research-peptide store with a partner (affiliate) program and a full admin panel.
Information architecture follows rebirthlabs.org; brand, colours, copy and imagery are KYVO's own.

| Layer | Stack |
|---|---|
| Web | Vite, React 19, TypeScript, Tailwind v4, shadcn/ui (Radix), TanStack Query, Motion, Phosphor icons |
| API | Fastify 5, Prisma 6, PostgreSQL 16, Zod, JWT httpOnly cookie sessions, sharp |
| Payments | ToyyibPay (FPX online banking + card), MYR |
| Runtime | Docker Compose: `db` (Postgres), `api` (Node 22), `web` (nginx serving the SPA, proxying `/api` and `/uploads`) |

## What is in the box

**Storefront**: home (hero, popular compounds, 5-cell bento, about, tier staircase, 4 ways to save, COA rail, FAQ), shop with search/category/sort, product pages (size + 1/3/5/10 quantity tiers, live points estimate, certificate summary with a view-only certificate viewer, lot history, specs), cart drawer with tier hints and free-shipping nudge, checkout (guest or account, points redemption, discount and partner codes), order page with ToyyibPay pay/verify/retry and tracking, Build a Box (4-slot monthly subscription), Bulk orders (wholesale ladder), COA library, Membership (Insider/VIP/Founder), Points, Partner program + application, partner dashboard, customer account, contact, FAQ, policies, 21+ age gate. Dark and light themes, mobile-first.

**Admin** (`/admin`): dashboard (KPIs vs previous period, needs-attention queue, revenue chart, top products, low stock), orders (filters, full detail, status actions with tracking, ToyyibPay re-check), products (variants with cost/stock, image upload, lab data), COA library management (upload a PDF, it is published as view-only pages), customers (tiers, points adjustments), partners (applications, commission rates, codes, commissions, payouts), finance (P&L, refunds, COGS, commissions, points liability, product margins, CSV export), Build a Box subscriptions, coupons, inbox + newsletter export, store settings (shipping, tiers, wholesale, box, partner terms, points, payment methods, ToyyibPay keys and live/test mode).

**Money rules: everything is a setting.** No price, percentage, threshold or limit is hardcoded. The pricing engine (`api/src/lib/pricing.ts`) reads Admin > Settings and each coupon record, and the shop renders its copy from the same values.

| Admin > Settings | What it controls (defaults in brackets) |
|---|---|
| Quantity discounts | on/off, count per compound or per order, ladder (3 = 30%, 5 = 35%, 10 = 40%), "add N more" hint distance |
| Bulk orders | on/off, count per product or per order, ladder (10 = 40%, 50 = 50%, 100 = 55%), free shipping, earn points, max units per order |
| Build a Box | on/off, slots (4), % off (40), minimum months (3), free shipping, earn points, free included item (Bacteriostatic Water) |
| Partner program | commission % (20), attribution days (30), partner-code shopper discount (10%), minimum payout (RM200), partner-code discount on bulk / box, partner code combines with quantity discounts, commission on bulk / box |
| Points | value of 100 points (RM1), points per RM1 (2.5), bonus over RM800 (+500), max % of an order payable with points (50), expiry (12 months), points combinable with codes |
| Orders and stock | unpaid-order expiry for online payment (3 days, also the ToyyibPay bill life) and manual payment (7 days), low-stock threshold (5) |
| Shipping and tax | flat fee (RM15), free-shipping threshold (RM800), tax % |

**Discount codes** (Admin > Coupons) each carry their own rules: percent, fixed amount or free shipping; percent cap; minimum spend; total uses; uses per customer (matched by account or email, guests included); start and end date; first order only; combine with quantity/bulk/box discounts or not; which order types (shop, bulk, Build a Box); whole order or selected products and categories. Uses are taken atomically at checkout and given back when an order is cancelled or refunded.

**Partners**: `?ref=code` links attribute for the configured window (last click wins); no self-referral. Commission is created when a referred order is paid, becomes withdrawable on delivery, and is voided on cancel or refund (also pulled out of an unpaid payout request). Payouts are bank transfers only: each request snapshots the partner's bank details, the admin records the bank reference, and partners are emailed whenever their bank details change.

**Membership** (Insider/VIP/Founder) is a licensed add-on, off by default and invisible to shoppers and admins alike. Set `ENABLE_MEMBERSHIP=true` in `.env` to unlock it; the code is kept intact.

**Stock** is reserved atomically at checkout and released on cancel, refund or unpaid expiry (after a final ToyyibPay check).

## Run it locally

```bash
cp .env.example .env            # fill POSTGRES_PASSWORD, JWT_SECRET, DATA_ENCRYPTION_KEY
docker compose up -d --build    # http://localhost:8600
```

The API container runs `prisma migrate deploy` and an idempotent catalogue seed on every start.

### Admin account (no credentials in .env)

On the very first start the seeder creates `admin@kyvo.local` with a random one-time password and prints it once:

```bash
docker compose logs api | grep -A8 "admin account created"
```

Sign in at `/admin`; the panel stays locked until you set your own email and password. Then add the ToyyibPay keys in Admin > Settings > ToyyibPay. A marker row in the database makes this a one-shot: the seeder never creates or changes an admin again, even after restarts or rebuilds.

Lost the password? Issue a new one-time password (prints once, must be changed at next sign-in):

```bash
docker compose exec api npm run admin:reset              # first admin
docker compose exec api npm run admin:reset -- you@x.com # a specific admin
``` Set `SEED_DEMO=1` before the first start to also create sample customers, partners and ~3 months of orders (demo users log in with `demo12345`). Never enable demo data on the VPS.

### Hot-reload development

```bash
docker compose up -d db                                   # Postgres on 127.0.0.1:8602
cd api && npm i && npx prisma migrate deploy
npx tsx --env-file=.env prisma/seed.ts                    # api/.env needs DATABASE_URL etc.
npx tsx watch --env-file=.env src/server.ts               # :8601
cd ../web && npm i && npm run dev                         # :5173, proxies /api and /uploads
```

### Product images

Source shots are 1536x1024 PNGs (about 1.8 MB each). `web/scripts/optimize-images.mjs` turns them into AVIF + WebP renditions (square 320/560/900 for cards and product pages, 3:2 960/1600 for hero panels). A card thumbnail on a phone is about 6 KB.

```bash
cd web && node scripts/optimize-images.mjs "C:/path/to/peptide-pngs"
```

Images uploaded in the admin go through the same pipeline on the server (`api/src/lib/images.ts`) and are served with year-long immutable caching.

### Certificates of analysis (view-only)

Certificates are never published as PDFs. Each page is shown as an image (AVIF with WebP fallback, 900 px for phones and 1700 px for desktop and zoom) inside a viewer with no download or print button; right-click, drag, long-press save, Ctrl+S/P and printing are blocked. Screenshots cannot be prevented by any website.

- Shipped certificates: page scans are pulled losslessly from the supplier PDFs and encoded by `web/scripts/optimize-coas.mjs` into `web/public/coa/<compound>/` (about 30 KB a page on phones, 55 KB on desktop, from 8 to 10 MB PDFs). `api/prisma/certificates.ts` holds the transcribed batch data and runs once (marker `coa.realDocs.v1`), replacing the placeholder lots for those products.
  ```bash
  pdfimages -j "Retatrutide COA.pdf" pages/Retatrutide_COA      # poppler, one JPEG per page
  cd web && node scripts/optimize-coas.mjs path/to/pages
  ```
- New certificates: Admin > COA library > upload a PDF or photo. The API rasterises it with poppler (`pdftoppm`, in the api image) and stores only the page images; the original file is not kept.
- Blends carry one certificate per compound (Reta Pro: Retatrutide + Cagrilintide). Set **Compound** on each certificate; the viewer shows one tab each.
- Leave a result blank when the certificate does not test it; blank rows are hidden on the site.

## Live server (https://kyvomethod.com)

| | |
|---|---|
| App | `/opt/kyvo` (this repo), compose project `kyvo`, web on `127.0.0.1:8600` only |
| Edge / TLS | [orxies](https://github.com/website-f/orxies) in `/opt/orxies`: owns 80/443, Let's Encrypt auto-renew. Site file: `/opt/orxies/sites/kyvomethod.com.yml` (copy in `deploy/orxies/`) |
| Firewall | ufw allows 22, 80, 443 only; fail2ban guards SSH |
| Orxies admin UI | loopback only: `ssh -L 8090:127.0.0.1:8090 root@<vps>` then http://127.0.0.1:8090 |

**Ship an update** (after pushing to `main`):

```bash
ssh root@<vps>
cd /opt/kyvo && ./deploy/deploy-vps.sh     # backup -> git pull -> build -> up -> health check
```

The script keeps 14 days of database backups in `/opt/kyvo/backups/`. Never run a bare `docker compose up` (it drops `docker-compose.vps.yml`), and never `docker compose down -v`: the `pgdata` and `uploads` volumes hold orders and product images.

**First install on a new server**: install Docker, clone to `/opt/kyvo`, `cp .env.vps.example .env` and fill it, run `./deploy/deploy-vps.sh`, read the one-time admin password from `docker compose -f docker-compose.yml -f docker-compose.vps.yml logs api`, then add an orxies site file pointing the domain at `127.0.0.1:8600`.

## ToyyibPay

Keys and live/test mode are managed in **Admin > Settings > ToyyibPay**, not in `.env`, so going live needs no redeploy.

- **Two key sets**: sandbox (dev.toyyibpay.com) and production (toyyibpay.com). Switching mode is one toggle; each side keeps its own keys.
- **Verified before saving**: every save asks ToyyibPay (`getCategoryDetails`) whether the secret key owns the category. Bad keys are never stored.
- **Encrypted at rest**: category code and secret key are sealed with AES-256-GCM using a key derived from `DATA_ENCRYPTION_KEY` (server `.env`), bound to each field. The database and its backups hold only ciphertext; the admin panel only ever sees the category code and the last 4 characters of the key.
- **Guarded changes**: saving keys, removing keys and switching mode ask for the admin's password, and each change is written to the change history. Going live requires verified production keys and an `https` `PUBLIC_URL` / `API_PUBLIC_URL` (the callback must be reachable).
- **Keep `DATA_ENCRYPTION_KEY` safe and unchanged.** `deploy/deploy-vps.sh` generates it once. If it is lost or changed, online payment switches itself off (shoppers no longer see it) and the keys must be entered again in the admin. Back up `.env` separately from the database.
- Upgrading from keys in `.env`: on first start they are imported once into encrypted settings; then delete the `TOYYIBPAY_*` lines.

How payments are confirmed:

- An order is marked paid only after the server re-queries `getBillTransactions` and the amount matches. The callback hash is checked against the secret of the gateway that issued the bill, but a forged or replayed callback cannot mark an order paid on its own.
- Every bill issued for an order is recorded with the gateway it was created on (`PaymentBill`). Payment checks look at all of them, so a shopper who pays from an old tab is still credited, and sandbox bills keep reconciling after you switch to production.
- One link per order: "Pay now" reuses the order's open bill. A bill closes when the unpaid order would be cancelled, and once an order is paid, cancelled or expired its other bills are deactivated at ToyyibPay (`inactiveBill`).
- Money that still lands after that (double payment, or paid after cancellation) is flagged on the order ("Extra payment ... needs a refund") and counted under **Payment issues** on the dashboard. ToyyibPay has no refund API: refund it from the ToyyibPay dashboard.
- Payment options (FPX, card or both) and who pays the ToyyibPay fee are in Admin > Settings > Payment methods. Card payments must be enabled on the ToyyibPay account.

## Email

The domain's mail runs on the same VPS: see [mail/README.md](mail/README.md). `https://<domain>/mail` is the control panel (accounts, forwarders, delivery log, DNS check) and `https://<domain>/webmail` is Roundcube.

The store sends through it as `noreply@` (`SMTP_*` in `.env`, written by `mail/deploy-mail.sh`). Every message has HTML and plain text, is DKIM-signed, and replies go to the support address in Admin > Settings.

- **Customers**: order received, payment received, shipped (with tracking), delivered, cancelled, refunded; password reset link (single use, 1 hour) and "password changed" notice. Changing or resetting a password signs out every other session.
- **Partners**: application received, approved, rejected, paused, payout sent, bank details changed.
- **Team** (Admin > Settings > Notifications, each on/off, sent to a team address or the support email): new paid order, partner application, payout request, contact form message (reply goes straight to the customer), payment issue.

Without `SMTP_HOST` the API logs each message and carries on.

## Before going live

- Review the policy pages (`web/src/components/account/policyContent.tsx`). Delivery times, report windows and refund timings there are sensible defaults, not legal advice.
- Replace the placeholder bank/DuitNow details in Admin > Settings before enabling manual payment methods.
- Set real product costs per size (Admin > Products) so finance margins are accurate. Seeded costs are estimates.
- Change the support email in Admin > Settings (and the team alert address under Notifications).
- Ask the domain's DNS host to publish the mail records shown in `/mail` > Email Deliverability, and set reverse DNS for the server IP at the VPS host.
