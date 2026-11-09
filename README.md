# Company A: resort booking app

A coffee estate resort in Chikkamagaluru: direct booking with allotment control, an enquiry inbox and an AI router. Brand name is a placeholder (`src/lib/site.ts`).

- **Live app:** https://isocode-resort-booking-and-manageme.vercel.app/
- **Technical design (submission):** [`documents/TDD.pdf`](documents/TDD.pdf) ([Markdown source](documents/TDD.md))
- **Run, deploy and reviewer tour:** [`deployment.md`](deployment.md)
- Working docs for the build are in `docs/`; start with `docs/06-progress.md`.

## What it does

- **Guests** search dates and party, build a stay of 1 to 4 rooms with live availability and prices including GST, sign up inline, hold the rooms for 10 minutes, pay through a mock gateway and get a confirmation. `/enquire` takes questions and event requests.
- **Staff** (reservations, sales, GM) edit nightly rates, allotment and offline dates, promo codes and bookings, and work an enquiry inbox. Each role sees only its lanes.
- **AI router**: every enquiry (web form, simulated email and WhatsApp) is classified, its dates and party extracted and checked against the message, routed to an owner, and given a draft reply priced only from the server quote. Low confidence goes to an unsorted lane; complaints always alert the GM; nothing is sent without a staff approval.

## Stack

Next.js 16 (App Router, React 19, server actions), TypeScript, Tailwind CSS 4, Drizzle ORM on PostgreSQL 16 (Neon), Auth.js v5 (JWT), Vercel AI SDK (Groq, Gemini, Anthropic or a local model; a rules fallback needs no key), Zod, Vitest and Playwright. Deployed on Vercel.

## Run locally

Requirements: Node 22+, pnpm, a Postgres 16 database (Docker or a Neon dev branch).

```bash
pnpm install
cp .env.example .env.local        # fill DATABASE_URL, DATABASE_URL_UNPOOLED, AUTH_SECRET (and TEST_DATABASE_URL for integration tests)
docker compose up -d              # optional local Postgres 16, see docker-compose.yml
pnpm db:reset && pnpm db:seed     # drops everything, migrates, seeds demo data (repeatable)
pnpm dev                          # http://localhost:3000
```

AI: `AI_PROVIDER=rules` works without any key. For live classification set `AI_PROVIDER=groq`, `AI_MODEL=openai/gpt-oss-120b` and `GROQ_API_KEY_1` (up to `_4`). Dev tools: `DEV_TOOLS_ENABLED=true` opens `/dev` (UI kit, inbound email and WhatsApp simulator, mock outbox, dev tools sign in); leave it off in production unless the demo needs the outbox.

Local Docker URL: `postgresql://resort:resort@localhost:5432/resort`.
`AUTH_SECRET` can be any long random string (`openssl rand -base64 32`).

`db:reset` and `db:seed` target `DATABASE_URL_UNPOOLED` only, and refuse production, an unset URL and any host in `DB_PROTECTED_HOSTS` (guard: `src/db/safety.ts`).

## Scripts

| Script                                                     | What it does                                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`                             | Next.js                                                                                                              |
| `pnpm typecheck` / `lint` / `format:check`                 | Static checks                                                                                                        |
| `pnpm test`                                                | Unit tests (no database)                                                                                             |
| `pnpm test:integration`                                    | Integration tests. They require `TEST_DATABASE_URL` (a separate database), migrate it, and the seed test re-seeds it |
| `pnpm db:generate` / `db:migrate` / `db:reset` / `db:seed` | Drizzle migrations and demo data                                                                                     |
| `pnpm db:deploy`                                           | Guarded production migration and demo seed, see `deployment.md` (never run by CI)                                    |
| `pnpm test:e2e`                                            | Playwright against a running app (`E2E_BASE_URL`)                                                                    |
| `pnpm eval:ai`                                             | AI evaluation over the 30 labelled seed enquiries (`--r5` writes `docs/eval/`)                                       |

## Demo logins (seed data)

All demo accounts use the password `Demo@12345` (public; see `deployment.md` before seeding production).

| Role         | Email                           | Sign in at     |
| ------------ | ------------------------------- | -------------- |
| Reservations | `reservations@companya.example` | `/admin/login` |
| Sales        | `sales@companya.example`        | `/admin/login` |
| GM           | `gm@companya.example`           | `/admin/login` |
| Guest        | `asha@guest.example`            | `/login`       |
| Guest        | `ravi@guest.example`            | `/login`       |

New guests can sign up at `/signup`. Staff and guest logins are separate: a guest cannot use the staff form and the reverse.

## Structure

See `docs/02-architecture.md`. Modules under `src/modules/*` (catalog, pricing, inventory, booking, payments, enquiries, ai-provider, ai-router) talk only through their `index.ts`; money is integer paise, dates are IST, prices come only from `pricing`.

## Tests

`pnpm test` runs the unit suite (no database). `pnpm test:integration -- --no-file-parallelism` runs the PostgreSQL suite against `TEST_DATABASE_URL` (a separate database; prefix `AI_PROVIDER=rules` if `.env.local` selects a live provider). `pnpm test:e2e` runs the Playwright flows (guest books and pays; staff approves a draft; security headers) against `E2E_BASE_URL`.
