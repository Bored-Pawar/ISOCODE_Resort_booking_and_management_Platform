# Company A: resort booking app

A coffee estate resort in Chikkamagaluru: direct booking with allotment control, an enquiry inbox and an AI router. Brand name is a placeholder (`src/lib/site.ts`). Docs in `docs/` are the source of truth; start with `docs/06-progress.md`.

## Run locally

Requirements: Node 22+, pnpm, a Postgres 16 database (Docker or a Neon dev branch).

```bash
pnpm install
cp .env.example .env.local        # then fill DATABASE_URL, DATABASE_URL_UNPOOLED, AUTH_SECRET
docker compose up -d              # optional local Postgres 16, see docker-compose.yml
pnpm db:reset && pnpm db:seed     # drops everything, migrates, seeds demo data (repeatable)
pnpm dev                          # http://localhost:3000
```

Local Docker URL: `postgresql://resort:resort@localhost:5432/resort`.
`AUTH_SECRET` can be any long random string (`openssl rand -base64 32`).

`db:reset` and `db:seed` refuse to run in production and against any host listed in `DB_PROTECTED_HOSTS`.

## Scripts

| Script                                                     | What it does                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`                             | Next.js                                                                                                                         |
| `pnpm typecheck` / `lint` / `format:check`                 | Static checks                                                                                                                   |
| `pnpm test`                                                | Unit tests (no database)                                                                                                        |
| `pnpm test:integration`                                    | Integration tests against `TEST_DATABASE_URL` or `DATABASE_URL_UNPOOLED`. They migrate, and the seed test re-seeds the database |
| `pnpm db:generate` / `db:migrate` / `db:reset` / `db:seed` | Drizzle migrations and demo data                                                                                                |

## Demo logins (seed data, development only)

All demo accounts use the password `Demo@12345`.

| Role         | Email                           | Sign in at     |
| ------------ | ------------------------------- | -------------- |
| Reservations | `reservations@companya.example` | `/admin/login` |
| Sales        | `sales@companya.example`        | `/admin/login` |
| GM           | `gm@companya.example`           | `/admin/login` |
| Guest        | `asha@guest.example`            | `/login`       |
| Guest        | `ravi@guest.example`            | `/login`       |

New guests can sign up at `/signup`. Staff and guest logins are separate: a guest cannot use the staff form and the reverse.

## Structure

See `docs/02-architecture.md`. Modules under `src/modules/*` talk only through their `index.ts`; in this walking skeleton they return fixtures.
