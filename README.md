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

**Storefront**: home (hero, popular compounds, 5-cell bento, about, tier staircase, 4 ways to save, COA rail, FAQ), shop with search/category/sort, product pages (size + 1/3/5/10 quantity tiers, live points estimate, rendered certificate, lot history, specs), cart drawer with tier hints and free-shipping nudge, checkout (guest or account, points redemption, discount and partner codes), order page with ToyyibPay pay/verify/retry and tracking, Build a Box (4-slot monthly subscription), Bulk orders (wholesale ladder), COA library, Membership (Insider/VIP/Founder), Points, Partner program + application, partner dashboard, customer account, contact, FAQ, policies, 21+ age gate. Dark and light themes, mobile-first.

**Admin** (`/admin`): dashboard (KPIs vs previous period, needs-attention queue, revenue chart, top products, low stock), orders (filters, full detail, status actions with tracking, ToyyibPay re-check), products (variants with cost/stock, image upload, lab data), COA library management, customers (tiers, points adjustments), partners (applications, commission rates, codes, commissions, payouts), finance (P&L, refunds, COGS, commissions, points liability, product margins, CSV export), Build a Box subscriptions, coupons, inbox + newsletter export, store settings (shipping, tiers, wholesale, box, partner terms, points, membership prices, payment methods).

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
cp .env.example .env            # fill POSTGRES_PASSWORD, JWT_SECRET, ToyyibPay keys
docker compose up -d --build    # http://localhost:8600
```

The API container runs `prisma migrate deploy` and an idempotent catalogue seed on every start.

### Admin account (no credentials in .env)

On the very first start the seeder creates `admin@kyvo.local` with a random one-time password and prints it once:

```bash
docker compose logs api | grep -A8 "admin account created"
```

Sign in at `/admin`; the panel stays locked until you set your own email and password. A marker row in the database makes this a one-shot: the seeder never creates or changes an admin again, even after restarts or rebuilds.

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

- Sandbox: `TOYYIBPAY_BASE_URL=https://dev.toyyibpay.com` with the sandbox secret key and category code.
- Live: switch to `https://toyyibpay.com` with the live key and category, and set `PUBLIC_URL` / `API_PUBLIC_URL` to the public HTTPS domain so the return URL and the server callback (`/api/payments/toyyibpay/callback`) are reachable.
- An order is marked paid only after the server re-queries `getBillTransactions` and the amount matches. The callback hash is verified, but a forged or replayed callback cannot mark an order paid on its own.
- Keys live only in `.env`. The admin settings page shows whether the gateway is configured, never the keys.

## Email

Set `SMTP_*` in `.env` to send order received, payment received, shipped (with tracking), delivered, cancelled and refunded emails, plus partner approval, rejection and payout notices. Without SMTP the API logs each message and carries on.

## Before going live

- Review the policy pages (`web/src/components/account/policyContent.tsx`). Delivery times, report windows and refund timings there are sensible defaults, not legal advice.
- Replace the placeholder bank/DuitNow details in Admin > Settings before enabling manual payment methods.
- Set real product costs per size (Admin > Products) so finance margins are accurate. Seeded costs are estimates.
- Change the support email in Admin > Settings.
