# Deployment and reviewer guide

Company A resort booking site and AI enquiry inbox.

## 1. Links

| Item | Link |
|---|---|
| Live app | <https://isocode-resort-booking-and-manageme.vercel.app/> |
| Repository | <https://github.com/Bored-Pawar/ISOCODE_Resort_booking_and_management_Platform> |
| Technical design | `TDD.pdf` (in the submission ZIP) |

## 2. Demo logins

All demo accounts use the public demo password `Demo@12345`. All data on the live app is synthetic.

| Role | Email | Sign in at | What this role sees |
|---|---|---|---|
| Guest | `asha@guest.example` (also `ravi@guest.example`) | `/login` | Search, booking, My bookings (`/account`). New guests can sign up at `/signup` or inline during booking |
| Reservations | `reservations@companya.example` | `/admin/login` | Overview, Rates, Allotment (with blackouts), Promos, Bookings, Inbox lanes for room and other enquiries |
| Sales | `sales@companya.example` | `/admin/login` | Overview, Inbox lanes for weddings and offsites. No rates, allotment, promos or bookings (they show a 403 screen) |
| GM | `gm@companya.example` | `/admin/login` | Everything, plus the Unsorted lane, Complaints, Failed AI with Retry, and the alert bell |

Guest and staff sign in are separate: a guest account cannot use `/admin/login` and the reverse.

## 3. Reviewer quick tour (about five minutes)

1. **Book a villa.** Open `/`, choose dates within the next three months, 2 adults, and press Check availability. Add a Garden Villa and press Continue (step 1). Sign in as the guest, or create an account inline (step 2), then press Hold my rooms. A 10 minute timer starts.
2. **Test payment (step 3).** Pick a test outcome:
   - **Card declined**: nothing is charged, the hold stays and you can retry.
   - **Bank times out**: use Check status, then Retry.
   - **Payment succeeds**: you land on the confirmation with the booking reference, GST breakdown, a calendar file and the email view. The booking also appears in My bookings.
3. **Send enquiries.** Sign in as GM at `/admin/login`, then open `/dev/test`. Pick a preset or type a message, choose Email or WhatsApp and press Send through webhook. You get an `ENQ-` reference. Try: "Is a Garden Villa free 14-16 Dec 2026 for 2 adults and 1 child?" (WhatsApp) and a complaint by email.
4. **See AI routing.** Open `/admin/inbox`. Within a few seconds the room enquiry shows category Room, a confidence badge, owner Reservations and a draft with a price "From the rate table". The complaint goes to the GM with an alert on the bell. Unclear messages land in Unsorted with no owner.
5. **Edit and watch the quote rebuild.** On the villa enquiry, change only the check-in date and press Save fields: the draft is rebuilt for the same Garden Villa at the new price. Then change only Room to Pool Villa and save: the draft is rebuilt within the save for Pool Villa (or says it is unavailable), and "Built on the saved details" shows the dates, party and room used. The old price is never offered for approval. The "Quote out of date" warning, with Approve disabled, appears only if a rebuild fails or for drafts edited before the fix.
6. **Approve and send.** Press Approve and send, confirm in the dialog, then open `/dev/outbox` (Replies tab) to see the reply. Nothing is sent without this click.
7. **Change a rate or allotment.** As Reservations, open `/admin/rates` or `/admin/allotment`, click a cell, change the value and save. An allotment below what is already sold or held is refused with the reason. Please restore any value you change, since the demo data is shared.

## 4. Run locally

### Prerequisites

| Tool | Version used |
|---|---|
| Node.js | 22.14.0 (22 or later) |
| pnpm | 12.18.0 (`corepack enable` picks it from `package.json`) |
| PostgreSQL | 16, either Docker (`docker compose up -d`, image `postgres:16`) or a Neon development branch |
| Docker Desktop | Optional, only for the local database |
| Playwright | 1.56.1 (installed by `pnpm install`; browsers with `pnpm exec playwright install chromium`) |

### macOS or Linux

```bash
git clone https://github.com/Bored-Pawar/ISOCODE_Resort_booking_and_management_Platform.git
cd ISOCODE_Resort_booking_and_management_Platform
corepack enable
pnpm install
cp .env.example .env.local
# Edit .env.local: DATABASE_URL, DATABASE_URL_UNPOOLED, AUTH_SECRET, AI_PROVIDER=rules
# Local Docker database (both URLs): postgresql://resort:resort@localhost:5432/resort
# AUTH_SECRET: any long random string, e.g. openssl rand -base64 32
docker compose up -d              # optional local Postgres 16
pnpm db:reset && pnpm db:seed     # drop, migrate and load demo data (repeatable)
pnpm dev                          # http://localhost:3000
```

### Windows (PowerShell)

```powershell
git clone https://github.com/Bored-Pawar/ISOCODE_Resort_booking_and_management_Platform.git
cd ISOCODE_Resort_booking_and_management_Platform
corepack enable
pnpm install
Copy-Item .env.example .env.local
# Edit .env.local as above
docker compose up -d
pnpm db:reset; if ($?) { pnpm db:seed }
pnpm dev
```

Then open <http://localhost:3000> (guest site), <http://localhost:3000/admin/login> (staff), and with `DEV_TOOLS_ENABLED=true` in `.env.local`, <http://localhost:3000/dev/test> and <http://localhost:3000/dev/outbox>.

`db:reset` and `db:seed` target `DATABASE_URL_UNPOOLED` and refuse production, an unset URL, and any host listed in `DB_PROTECTED_HOSTS`.

### Tests

| Suite | Command |
|---|---|
| Static checks | `pnpm typecheck && pnpm lint` |
| Unit (no database) | `pnpm test` |
| PostgreSQL integration | Set `TEST_DATABASE_URL` to a **separate** database, then `pnpm test:integration -- --no-file-parallelism`. If `.env.local` selects a live AI provider, set `AI_PROVIDER=rules` first (PowerShell: `$env:AI_PROVIDER="rules"`). Serial profile for a remote database: `pnpm exec vitest run --config vitest.postgres.config.mts --maxWorkers=1` |
| End to end (Playwright) | `pnpm build && pnpm start`, then `E2E_BASE_URL=http://localhost:3000 pnpm test:e2e` (PowerShell: `$env:E2E_BASE_URL="http://localhost:3000"; pnpm test:e2e`). Needs the demo seed and `DEV_TOOLS_ENABLED=true` |

## 5. Deployment

| Item | Setting |
|---|---|
| Hosting | Vercel project connected to the GitHub repository. Every push to `main` deploys to production |
| Framework and build | Next.js preset, install `pnpm install`, build `pnpm build`. No custom commands |
| Region | `vercel.json` pins functions to `cle1` (Cleveland, AWS us-east-2), matching the Neon database region |
| Database | Neon PostgreSQL 16, AWS `us-east-2`. The app uses the pooled `DATABASE_URL` at runtime |
| Cron | `vercel.json`: `GET /api/cron/expire-holds` daily at `0 0 * * *` (00:00 UTC, 05:30 IST). Vercel sends `Authorization: Bearer $CRON_SECRET`. It expires stale holds and sweeps stuck AI work. Holds also expire lazily on every read, so the cron is a safety net |
| Migrations and seed | Manual and guarded, from a developer machine, never from CI: `ALLOW_PRODUCTION_SEED=yes PRODUCTION_DATABASE_URL_UNPOOLED="<direct URL>" pnpm db:deploy`. Add `--migrate-only` to keep data. It refuses a pooled URL or one matching the development or test database, prints the target host and waits 10 seconds. **The seed truncates every table**; use it only on an empty demo database |
| Redeploy | Push or merge to `main`, or use Redeploy on the Vercel deployment page |

Not verified from the dashboard during this submission: that the cron is active, and which Neon branch production uses. Both are configured in the repository as above.

## 6. Environment variables (names only)

Values live in Vercel (Project, Settings, Environment Variables) and in your own `.env.local`. Never in the repository.

| Name | Required | Purpose | Used in |
|---|---|---|---|
| `DATABASE_URL` | Yes | Neon pooled connection | App runtime (`src/db`) |
| `DATABASE_URL_UNPOOLED` | Scripts only | Direct connection for migrate, reset, seed | `src/db/migrate.mts`, seed |
| `AUTH_SECRET` | Yes | Auth.js signing secret | `src/lib/auth` |
| `CRON_SECRET` | Yes | Bearer token for the cron | `/api/cron/expire-holds` |
| `PAYMENT_WEBHOOK_SECRET` | Yes | HMAC SHA-256 key (16 or more characters) for the mock payment webhook. Unset means every payment webhook is refused | `src/modules/payments` |
| `INBOUND_WEBHOOK_SECRET` | Yes | `x-inbound-secret` header for the email and WhatsApp webhooks | `/api/inbound/*` |
| `AI_PROVIDER` | Yes (set explicitly; code default is `google`) | `groq`, `google`, `anthropic`, `local` or `rules` | `src/modules/ai-provider/factory.ts` |
| `AI_MODEL` | With a model provider | Model id, `openai/gpt-oss-120b` for Groq | same |
| `GROQ_API_KEY_1` to `GROQ_API_KEY_4` | With `groq` (at least one) | Tried in order; a limited key cools down and the next is used | `src/modules/ai-provider/transport.ts` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | With `google` | Gemini | ai-provider |
| `ANTHROPIC_API_KEY` | With `anthropic` | Claude | ai-provider |
| `LOCAL_AI_BASE_URL` | With `local` | OpenAI compatible server such as Ollama (not reachable from Vercel) | ai-provider |
| `HOLD_MINUTES` | No (default 10) | Hold length | `src/modules/booking` |
| `DEV_TOOLS_ENABLED` | No | `true` opens `/dev` (simulator, outbox, UI kit). On for the judged demo | `src/lib/dev-tools.ts` |
| `TEST_DATABASE_URL` | Local only | Separate database for integration tests | `tests/integration` |
| `DB_PROTECTED_HOSTS` | Local only | Host fragments the destructive scripts refuse | `src/db/safety.ts` |
| `ALLOW_PRODUCTION_SEED`, `PRODUCTION_DATABASE_URL_UNPOOLED` | Shell only, for `db:deploy` | Guarded production migrate and seed | `scripts/db-deploy.mts` |

## 7. AI setup

| Item | Detail |
|---|---|
| Provider and model | Groq, `openai/gpt-oss-120b` |
| Get a key | Create a free account at console.groq.com, then API Keys, Create. Put it in `GROQ_API_KEY_1` (up to four keys in `_1` to `_4`) |
| Set | `AI_PROVIDER=groq`, `AI_MODEL=openai/gpt-oss-120b`, the key(s), then redeploy |
| No key at all | Use `AI_PROVIDER=rules`. A keyword classifier runs, with confidence capped at 0.5, so every enquiry lands in the Unsorted lane for the GM. Drafts use the safe template; prices still come from the rate table |
| Key limited or quota exhausted | A key that returns 429, 401 or 403 cools down (Retry-After, else 60 s) and the next key is tried. If all fail, the enquiry falls back to rules and goes to Unsorted. Nothing is lost: the enquiry was saved before the AI call |
| Timeouts | 10 s per attempt, at most one retry. A crashed run is reclaimed after 2 minutes; after 3 attempts the GM sees it under Failed AI with Retry |
| Free tier limit | Groq free tier: 8,000 tokens per minute per organisation, about 2,500 tokens per classification. Keys from one organisation share that limit |
| Data | Only synthetic data. Names, emails, phones, landlines, PIN code lines and ID numbers are redacted before the call |

## 8. Mocked parts

| Part | How the mock works |
|---|---|
| Payments | `MockProvider` on the pay page with three outcomes (succeeds, declined, timeout). It signs the result with HMAC SHA-256 and calls the same handler as `POST /api/payments/mock` (header `x-payment-signature`). Confirmation is exactly once. A payment after the hold expired is marked refund pending. Nothing is charged |
| Email in | `POST /api/inbound/email` with Postmark shaped JSON and `x-inbound-secret` |
| WhatsApp in | `POST /api/inbound/whatsapp` with Meta Cloud API shaped JSON and `x-inbound-secret`. Meta signature verification and the GET handshake are not implemented |
| Simulator | `/dev/test` posts the same shapes through the same code, with presets |
| Replies and booking emails | Shown in the mock outbox `/dev/outbox` (booking emails and a Replies tab). Nothing is emailed or messaged |
| Reservation system, channel manager | Not connected (out of scope) |

## 9. Troubleshooting and known limits

| Symptom | Cause and fix |
|---|---|
| Every enquiry lands in Unsorted | `AI_PROVIDER=rules`, or no valid Groq key. Set the key and redeploy |
| Test payment never confirms | `PAYMENT_WEBHOOK_SECRET` unset or shorter than 16 characters |
| `/dev/test` or `/dev/outbox` returns 404 | `DEV_TOOLS_ENABLED` is not `true` |
| Webhook returns 401 | Missing or wrong `x-inbound-secret` |
| `db:reset` refuses to run | The URL is unset, production, or matches `DB_PROTECTED_HOSTS` (by design) |
| Integration tests refuse to start | `TEST_DATABASE_URL` is missing or points at the development database |
| Integration tests slow or killed for memory | Run serially with `--maxWorkers=1` (remote Neon round trips dominate) |
| Too many attempts on sign in | In memory rate limit per server instance; wait 15 minutes |

Known limits: demo staff logins are public; rate limits are in memory per instance; the CSP allows inline scripts; hold expiry is lazy plus a daily cron; no real payment, email or WhatsApp provider; the outbox is derived, not a table. See section 12 of the TDD for the full list.
