# Deployment

Company A resort booking app: Next.js 16 (App Router) on **Vercel**, PostgreSQL 16 on **Neon**. Everything below uses environment variable **names only**; values live in Vercel and in your own `.env.local`, never in the repo.

## Run locally, step by step

1. Install Node 22+ and pnpm (`corepack enable`).
2. `pnpm install`
3. `cp .env.example .env.local` and fill at least `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (a Neon development branch or local Docker Postgres 16), `AUTH_SECRET` (`openssl rand -base64 32`). Set `AI_PROVIDER=rules` to run without any AI key.
4. Optional local database: `docker compose up -d`, then use `postgresql://resort:resort@localhost:5432/resort` for both URLs.
5. `pnpm db:reset && pnpm db:seed`: migrate and load the demo data (repeatable; refuses production and protected hosts).
6. `pnpm dev` and open http://localhost:3000. Demo logins are in `README.md`.
7. Tests: `pnpm typecheck && pnpm lint && pnpm test`. Integration tests need `TEST_DATABASE_URL` (a separate database): `pnpm test:integration -- --no-file-parallelism`. End to end: `pnpm build && pnpm start`, then `E2E_BASE_URL=http://localhost:3000 pnpm test:e2e`.

## How it is deployed

- **Vercel** builds with `pnpm build` (framework preset Next.js, install `pnpm install`). No custom build command.
- **Region match.** The Neon project is in AWS `us-east-2` (Ohio; read from the database host name). `vercel.json` pins the functions to Vercel region **`cle1`** (Cleveland, us-east-2), so each query is a few milliseconds instead of a cross-region round trip. Confirm the production database host also contains `us-east-2` before deploying (the region was read from the development branch host); if the project is elsewhere, change `regions` to the matching Vercel region.
- **Cron.** `vercel.json` runs `GET /api/cron/expire-holds` daily at 00:00 UTC (05:30 IST; Vercel Hobby allows daily crons). Vercel sends `Authorization: Bearer $CRON_SECRET`. The route expires stale holds and sweeps stuck AI work. Holds also expire lazily on every read, so the daily cron is a backstop, not the main mechanism.
- **Database connections.** The app uses the pooled `DATABASE_URL` at runtime. Migrations need the direct (unpooled) connection.
- **Migrations and demo seed** are manual and guarded, run once from your PC against the production database:
  ```bash
  ALLOW_PRODUCTION_SEED=yes PRODUCTION_DATABASE_URL_UNPOOLED="<direct Neon URL>" pnpm db:deploy
  # later schema changes only, keeping data:
  ALLOW_PRODUCTION_SEED=yes PRODUCTION_DATABASE_URL_UNPOOLED="<direct Neon URL>" pnpm db:deploy --migrate-only
  ```
  `db:deploy` refuses without `ALLOW_PRODUCTION_SEED=yes`, refuses a pooled URL or one that matches the development or test database (it compares against `.env.local`), never reads its target from `.env.local`, prints the target host fragment first and waits 10 seconds before seeding. **The seed truncates every table**: use it only on an empty production database for the demo.
- **Auth.** Auth.js v5 with JWT sessions; on Vercel the host is trusted automatically. Sign in and out go through server actions only; `POST /api/auth/callback/*` and `/api/auth/signin/*` return 404 by design (rate limiting).

## Environment variables (names only)

Set these in Vercel, Project, Settings, Environment Variables (Production, and Preview if used).

| Name                                 | Required                                           | Purpose                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                       | yes                                                | Neon **pooled** connection string, used at runtime                                                                                                               |
| `DATABASE_URL_UNPOOLED`              | no (scripts only; the Neon integration may add it) | Neon direct connection; used by the guarded scripts (not by the running app)                                                                                     |
| `AUTH_SECRET`                        | yes                                                | Auth.js signing secret, a long random string                                                                                                                     |
| `CRON_SECRET`                        | yes                                                | Bearer token Vercel Cron sends to `/api/cron/expire-holds`                                                                                                       |
| `PAYMENT_WEBHOOK_SECRET`             | yes                                                | HMAC SHA-256 key (16+ chars) for the mock payment webhook `/api/payments/mock`; unset means every webhook is refused and test payments cannot confirm            |
| `INBOUND_WEBHOOK_SECRET`             | yes                                                | Shared secret header `x-inbound-secret` for `/api/inbound/email` and `/api/inbound/whatsapp`                                                                     |
| `AI_PROVIDER`                        | yes (code default `google`; set it explicitly)     | `groq`, `google`, `anthropic`, `local` or `rules` (`rules` needs no key; everything goes to the unsorted lane)                                                   |
| `AI_MODEL`                           | with a model provider                              | Model id, e.g. `openai/gpt-oss-20b` for Groq                                                                                                                     |
| `GROQ_API_KEY_1` to `GROQ_API_KEY_4` | with `AI_PROVIDER=groq`                            | Tried in order; a key that hits 429/401/403 cools down and the next is used                                                                                      |
| `GOOGLE_GENERATIVE_AI_API_KEY`       | with `google`                                      | Gemini                                                                                                                                                           |
| `ANTHROPIC_API_KEY`                  | with `anthropic`                                   | Claude                                                                                                                                                           |
| `LOCAL_AI_BASE_URL`                  | with `local`                                       | OpenAI compatible local server (not reachable from Vercel)                                                                                                       |
| `HOLD_MINUTES`                       | no                                                 | Hold length, default 10                                                                                                                                          |
| `DEV_TOOLS_ENABLED`                  | no                                                 | `true` opens `/dev` (UI kit, inbound simulator, mock outbox, dev login). For a judged demo it can be `true` so the mock outbox is visible; otherwise leave unset |
| `DB_PROTECTED_HOSTS`                 | local only                                         | Host fragments the destructive scripts refuse (put the production host here in `.env.local`)                                                                     |
| `TEST_DATABASE_URL`                  | local only                                         | Separate database for integration tests                                                                                                                          |

Not set in Vercel: `ALLOW_PRODUCTION_SEED`, `PRODUCTION_DATABASE_URL_UNPOOLED` (only in your shell for `db:deploy`).

## Demo logins (seeded data)

All demo accounts use the password `Demo@12345`. `db:deploy` seeds production with the same accounts, so the public password gives staff access on the live URL: accepted for the judged demo; for anything else change the staff passwords right after seeding (or do not seed). Never seed a database holding real data.

| Role         | Email                                      | Sign in at     |
| ------------ | ------------------------------------------ | -------------- |
| Reservations | `reservations@companya.example`            | `/admin/login` |
| Sales        | `sales@companya.example`                   | `/admin/login` |
| GM           | `gm@companya.example`                      | `/admin/login` |
| Guest        | `asha@guest.example`, `ravi@guest.example` | `/login`       |

## Mock payment and webhooks

- Payments are a mock gateway (`payments.MockProvider`): on the pay page the guest picks a test outcome (succeeds, declined, timeout). The signed webhook `POST /api/payments/mock` (header `x-payment-signature`, hex HMAC SHA-256 of the raw body with `PAYMENT_WEBHOOK_SECRET`) confirms or fails a payment; a payment arriving after the hold expired is marked refund pending, never re-held. Nothing is charged.
- Inbound email and WhatsApp are simulated by posting provider-shaped JSON (Postmark, Meta Cloud API) to `/api/inbound/email` and `/api/inbound/whatsapp` with `x-inbound-secret`; `/dev/test` has a simulator. Replies go to the mock outbox `/dev/outbox`; nothing is emailed or messaged.

## Known limits

- Rate limits are in memory per server instance (`docs/02-architecture.md` Security 5); a shared store is the production step.
- CSP allows inline scripts (`'unsafe-inline'`, no nonces) to keep partial prerendering.
- Hold expiry relies on lazy expiry plus a daily cron (Hobby plan limit).
- LCP on simulated Slow 4G is about 3 s on image-led pages locally (`docs/perf/h3-results.md`); JS is within budget.
- AI: with Groq, 9 of 30 labelled enquiries fell back to rules (`docs/eval/r5-results.md`); complaints always reach the GM.
- No real email, WhatsApp or payment provider; no outbox table (the outbox is derived).
- Inbox: no index on `enquiry_events.enquiry_id`; summary search is `ILIKE` on jsonb.
