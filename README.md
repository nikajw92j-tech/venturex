# VENTUREX — Digital Business Marketplace

A full-stack marketplace for buying, selling and auctioning digital businesses — websites, SaaS, e-commerce stores, apps, domains and early-stage projects (Starter Market). It includes real-time auctions with proxy bidding and anti-sniping, protected payments with a structured 8-stage handover, automatic platform commission, paid promotions, seller subscriptions, messaging, notifications, an AI-assisted valuation tool, and a full admin panel. UI in English, Georgian and Russian; prices displayed in USD, GEL, EUR or RUB.

---

## Contents

1. [Tech stack](#tech-stack)
2. [Quick start (local)](#quick-start-local)
3. [Environment variables](#environment-variables)
4. [Payments, escrow and payouts](#payments-escrow-and-payouts)
5. [Background scheduler](#background-scheduler)
6. [Deployment](#deployment)
7. [Testing](#testing)
8. [Architecture notes](#architecture-notes)
9. [Operations checklist before launch](#operations-checklist-before-launch)
10. [Known limitations](#known-limitations)

---

## Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions), React 19, TypeScript |
| Styling / motion | Tailwind CSS 4, Framer Motion, GSAP (hero background), canvas-confetti |
| Database | PostgreSQL + Prisma 6 (migrations in `prisma/migrations`) |
| Auth | Own session auth (hashed tokens in DB, httpOnly cookies), bcrypt, Google OAuth via `arctic`, email verification & password reset |
| Real time | Server-Sent Events fed by PostgreSQL `LISTEN/NOTIFY` (works across multiple app instances, no extra infrastructure) |
| Payments | Stripe Connect (separate charges & transfers) behind a provider interface; dev-only sandbox provider |
| Escrow | Escrow.com API for high-value deals, with an audited manual-escrow fallback |
| Files | S3-compatible storage (AWS S3, Cloudflare R2, MinIO…); local disk in development |
| Email | Any SMTP provider via Nodemailer, sent through a DB outbox |
| AI | Anthropic Claude (`claude-opus-5-5` by default) for optional valuation commentary |
| Charts | Recharts with a colour-blind-validated palette, tooltips and table views |

---

## Quick start (local)

Requirements: Node.js 20+ (22/24 recommended). PostgreSQL is optional — the repo can run an embedded one.

```bash
npm install
cp .env.example .env

# Option A — no Postgres installed: start an embedded server on port 5433 (keep it running)
npm run db:local
# Option B — your own Postgres: set DATABASE_URL in .env

npm run db:deploy        # apply migrations
npm run db:sample        # plans, promotion packages, commission tiers + DEV sample data
npm run dev              # http://localhost:3000 (set APP_URL accordingly)
```

Sample accounts (password `Password123!`, development only):

| Email | Role |
|---|---|
| `admin@venturex.local` | Administrator |
| `nika@venturex.local`, `ana@venturex.local`, `maxdev@venturex.local` | Sellers |
| `buyer@venturex.local`, `buyer2@venturex.local` | Buyers |

In development, emails (verification links, notifications) are printed to the server console, and payments use the **sandbox provider**: checkout opens a clearly marked test page where you choose “successful payment” or “declined card”. The sandbox refuses to run when `NODE_ENV=production`.

Run the scheduler in a second terminal so auctions settle and emails go out on time:

```bash
CRON_SECRET=<value from .env> APP_URL=http://localhost:3000 npm run worker
```

Make yourself an admin on any environment:

```bash
npm run make-admin -- you@example.com
```

For production, seed only the base configuration (never sample data):

```bash
npm run db:seed
```

---

## Environment variables

See `.env.example` for the full annotated list.

| Variable | Required | Purpose |
|---|---|---|
| `APP_URL` | yes | Public base URL (emails, OAuth callback, sitemap, payment redirects) |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_SECRET` | yes | Long random string |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/tick` |
| `PAYMENT_PROVIDER` | yes | `stripe` in production; `sandbox` only works in development |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | production | Stripe API key and webhook signing secret |
| `STRIPE_CONNECT_COUNTRY` | production | Default country for seller Express accounts |
| `ESCROW_API_URL`, `ESCROW_EMAIL`, `ESCROW_API_KEY` | recommended | Escrow.com broker account for high-value sales |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | production | File storage (uploads fail in production without it) |
| `SMTP_URL`, `EMAIL_FROM` | production | Outgoing email |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | “Continue with Google” (redirect URI: `${APP_URL}/api/auth/google/callback`) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | optional | AI commentary on valuations; without it the deterministic model still works |
| `EXCHANGE_RATE_URL` | optional | Display-only exchange rates (defaults to open.er-api.com) |

The admin panel’s **Settings → Integrations** card shows which integrations are live.

---

## Payments, escrow and payouts

### How money moves

1. A purchase (fixed price, accepted offer, auction win or Buy Now) creates a **Deal** in `PENDING_PAYMENT`, with the commission calculated and frozen at that moment.
2. The buyer pays through the provider’s hosted checkout. **Only a signature-verified webhook** (or the dev sandbox) can mark the deal `PAID` — never a button in the UI.
3. Funds stay on the platform’s provider balance while the seller works through the handover checklist and both parties confirm.
4. Release requires: verified payment + buyer confirmation + seller confirmation + no open dispute + documented approval (automatic below `adminReleaseThresholdUsd`, recorded in the audit log; an administrator above it).
5. The seller’s share is transferred to their connected account. The commission is simply the part not transferred, and only now becomes **earned revenue**.
6. Cancelled, expired or refunded deals never earn commission. A payment that arrives after a deal was cancelled is refunded automatically.

Deals at or above `escrowThresholdUsd` (default $10,000) go through **Escrow.com** instead, with VENTUREX as broker collecting the commission as a broker fee. Webhooks from Escrow.com are only hints — the status is always re-fetched from the API. If the Escrow API isn’t configured or the currency isn’t supported by Escrow.com, administrators use the manual escrow workflow in **Admin → Transactions**, which requires recording the verified escrow reference and is audit-logged.

### Commission tiers (editable in Admin → Commission)

| Final sale price (USD equivalent) | Commission |
|---|---|
| $0 – $499 | 10% |
| $500 – $1,999 | 8% |
| $2,000 – $9,999 | 6% |
| $10,000+ | 4% |

Tiers are chosen by the USD value at deal creation; the commission is charged in the deal’s own currency.

### ⚠️ Provider availability

**Stripe does not currently onboard platforms or sellers based in Georgia**, and Stripe Connect cross-border payouts are limited. Before launch:

- Register the operating entity in a Stripe-supported country (e.g. EU/UK/US) **or** add a local provider. The integration is isolated behind `src/lib/payments/types.ts` (`PaymentProvider`): implement `createCheckout`, `refund`, `payout`, `onboardingLink`, etc. for your provider (e.g. a Georgian bank’s marketplace/split-payment API) and route webhooks to `handlePaymentSucceeded` / `handlePaymentFailed`.
- Confirm with your provider that holding funds until handover and paying out later is permitted under your account type; obtain legal advice on licensing (payment facilitation / escrow) in your operating country.
- GEL promotions and subscriptions require a provider that settles in GEL.

### Stripe setup

1. Enable **Connect** (Express accounts) in the Stripe dashboard.
2. Webhook endpoint: `${APP_URL}/api/webhooks/stripe` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `customer.subscription.updated`, `customer.subscription.deleted`, `account.updated`.
3. Put the signing secret into `STRIPE_WEBHOOK_SECRET`, set `PAYMENT_PROVIDER=stripe`.
4. Test with `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and test keys before going live.

---

## Background scheduler

`POST /api/cron/tick` (header `Authorization: Bearer $CRON_SECRET`) runs every job idempotently, protected by a DB lock so overlapping runs are safe:

- settle auctions whose time has passed (winner → pending purchase; reserve not met → no sale)
- “ending soon” alerts, expired offers, unpaid purchase expiry (listing returns to the market)
- promotion expiry, payout retries after seller onboarding, escrow status sync
- exchange-rate refresh + USD re-normalisation of prices (every 6 h), demo-link checks (daily)
- email outbox

Auctions are also settled lazily the moment anyone views a finished auction, so the scheduler interval doesn’t affect correctness — only how quickly winners are emailed. Run it every 30–60 seconds:

- **Vercel**: `vercel.json` registers a daily cron, the most the Hobby plan allows. For timely emails, also call the endpoint every minute from an external pinger such as cron-job.org with the bearer header, or on a Pro plan change the schedule to `* * * * *`.
- **Docker / VPS**: the `worker` service in `docker-compose.yml`, or `npm run worker` under systemd/pm2.

---

## Deployment

### Option A — Vercel + managed Postgres

1. Create a Postgres database (Neon, Supabase, RDS…). Use a **direct (non-pooled) connection** for `DATABASE_URL`, or make sure the pooler supports `LISTEN/NOTIFY` (session mode). Transaction-mode poolers break real-time updates.
2. Import the repo into Vercel and set the environment variables above.
3. Build command `npm run build` (runs `prisma generate`). Apply migrations from CI or locally: `DATABASE_URL=... npm run db:deploy`, then `npm run db:seed`.
4. Configure the Stripe webhook, S3 bucket, SMTP and Google OAuth redirect URI with your production domain.
5. Note: Server-Sent Events keep a function running per open auction page. On serverless platforms this counts toward function duration; for heavy auction traffic prefer Option B.

### Option B — Docker (VPS / any container host)

```bash
cp .env.example .env   # fill in secrets, set APP_URL=https://your-domain
POSTGRES_PASSWORD=... CRON_SECRET=... docker compose up -d --build
# Seed base configuration once, from a checkout of the repo that can reach the database:
DATABASE_URL=postgresql://venturex:<password>@<db-host>:5432/venturex npm run db:seed
```

The app container applies pending migrations on start. Put it behind a reverse proxy (Caddy/Nginx/Traefik) with HTTPS, and disable response buffering for `/api/realtime` (`X-Accel-Buffering: no` is already sent). Multiple app replicas are supported — real-time fan-out and rate limits live in Postgres.

### After deploying

```bash
npm run make-admin -- you@yourcompany.com
```

Then open **/admin/settings** to check the Integrations card and adjust thresholds, and **/admin/commissions**, **/admin/plans**, **/admin/promotions** to review pricing.

---

## Testing

```bash
npm test                    # unit tests: commission, proxy bidding, anti-sniping, money, valuation
npm run test:integration    # service flows against the DB in .env (creates and removes its own data)
node tests/e2e/ui-flow.mjs  # browser walkthrough against a running dev server with sample data
```

The integration suite covers concurrent bidding (no lost updates), seller self-bid blocking, anti-sniping extension, settlement with/without reserve, Buy Now, the full pay → handover → release flow with commission becoming earned exactly once, admin-gated release for large sales, no commission on cancelled/refunded deals, multi-currency tier selection, and promotion activation/expiry.

The browser walkthrough (needs Edge or Chrome installed) checks real-time bid updates between two users, outbid alerts, sandbox checkout, the complete handover by buyer and seller, the promotion modal, admin analytics and the Georgian mobile layout. Set `BASE_URL` if the dev server isn’t on `http://localhost:3100`.

---

## Architecture notes

```
src/
  app/                 routes (pages, server actions in app/actions, API routes in app/api)
    admin/             admin panel (role-gated in layout + every action)
    dashboard/         buyer & seller dashboards, deal/handover view
  components/          UI (design system in components/ui.tsx)
  i18n/                dictionaries (en/ka/ru), server + client helpers
  lib/
    auction/engine.ts  pure proxy-bidding & anti-sniping logic (unit tested)
    auction/service.ts row-locked bidding, settlement, Buy Now
    deals.ts           deal state machine, handover, release, disputes
    commission.ts      tier logic (unit tested)
    payments/          provider interface, Stripe, sandbox, Escrow.com, webhook handlers
    realtime.ts        Postgres LISTEN/NOTIFY → SSE fan-out
    notify.ts          localized notifications + email outbox
prisma/                schema, migrations, seed
```

Key guarantees:

- **Money is integers** in minor units with the currency stored alongside; USD-normalised columns are used only for sorting, filtering and tier selection.
- **Bids are serialized** with `SELECT … FOR UPDATE` on the auction row inside a transaction; the same pattern protects listings from double purchase and deals from concurrent state changes.
- **Real-time events are published inside the DB transaction** (`pg_notify`), so clients never see an event for a change that rolled back.
- **Contract amounts never change with display currency**; converted prices are labelled with `≈` and the original amount is always shown.
- **Promoted listings are always labelled as ads**, trust scores use only verifiable platform data, and reviews/testimonials can only come from completed deals.
- **Security**: role checks in every admin action, Zod validation on all inputs, Postgres-backed rate limiting, CSRF origin checks on API routes (Server Actions have Next.js’ built-in check), signature-verified webhooks, magic-byte file validation with private files served only to authorised users, SSRF protection on demo-link checks, httpOnly SameSite cookies, security headers, no card data stored, audit log for every financial and moderation step.

---

## Operations checklist before launch

- [ ] Legal review of Terms, Privacy and Refund & Dispute policies (the bundled texts are starting points, not legal advice), and of payment/escrow licensing in your jurisdiction.
- [ ] Live payment provider configured and tested end-to-end with real (small) transactions, including refunds and payouts.
- [ ] Escrow.com broker account (or documented manual escrow process) for sales above the escrow threshold.
- [ ] S3 bucket private by default (the app serves files through access-controlled URLs), backups enabled for Postgres.
- [ ] SMTP domain authentication (SPF, DKIM, DMARC).
- [ ] Scheduler running every 30–60 seconds.
- [ ] `requireListingApproval` on, moderation staff assigned to the listing/verification/report queues.

---

## Known limitations

- The admin panel and some dashboard detail text (e.g. handover stage descriptions) are in English; the public site, navigation, listings, selling flow and notifications are fully translated into Georgian and Russian. Legal pages are English with a notice that the English text governs.
- Escrow.com status mapping follows its documented transaction status flags; verify against your sandbox account before relying on automatic sync (the manual escrow workflow is always available).
- Display exchange rates come from a free public endpoint by default; point `EXCHANGE_RATE_URL` at a contracted provider for production.
- Live-demo previews embed third-party sites in a sandboxed iframe; sites that forbid framing show the “Open demo” button instead.
