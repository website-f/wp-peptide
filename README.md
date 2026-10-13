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

**Money rules (server-side, single source of truth: `api/src/lib/pricing.ts`)**
- Quantity tiers per compound across sizes: 3 = 30%, 5 = 35%, 10 = 40% (editable).
- Wholesale per product: 10 = 40%, 50 = 50%, 100 = 55%; does not stack with tiers, codes or points multipliers.
- Partner codes give shoppers 10% off and attribute the order; `?ref=code` links attribute for 30 days (last click wins). No self-referral.
- Commission 20% of the order after discounts, excluding shipping/tax. Created when paid, becomes withdrawable when delivered, voided on cancel/refund (also pulled out of an unpaid payout request).
- Partner payouts are bank transfers only. Partners give bank, account holder and account number when they apply; each payout request snapshots those details, the admin transfers manually and records the bank reference, and partners are emailed when their bank details change.
- Membership (Insider/VIP/Founder) is behind a switch in Admin > Settings > Programs, off by default. While off, the page, nav link and tier perks are hidden and everyone earns the base points rate.
- Points: 2.5 / 3.5 / 5 / 10 per RM1 by tier, 1 point = 1 sen, redeem up to 50% of an order, +500 bonus over RM800.
- Stock is reserved atomically at checkout and released on cancel/refund. Unpaid orders auto-cancel (3 days for ToyyibPay, 7 days for manual methods) after a final gateway check.

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

## Deploy to the VPS (shared reverse proxy)

KYVO reserves ports **8600-8609**. It binds only to `127.0.0.1:8600`; the shared Caddy in `/opt/reverse-proxy` terminates TLS.

```bash
# /opt/kyvo
cp .env.vps.example .env && nano .env
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build

# /opt/reverse-proxy: add KYVO_DOMAIN + KYVO_UPSTREAM=127.0.0.1:8600, then a single-upstream block:
#   {$KYVO_DOMAIN} {
#     reverse_proxy {$KYVO_UPSTREAM}
#   }
./deploy-vps.sh
```

Never run `docker compose down -v` on the VPS: the `pgdata` and `uploads` volumes hold orders and product images.

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
