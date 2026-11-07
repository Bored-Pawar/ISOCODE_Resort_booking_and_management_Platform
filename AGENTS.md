# AGENTS.md

Instructions for Codex. Claude Code follows `CLAUDE.md`. Both agents use the same `docs/` as the source of truth.

## Read first, every task
1. `docs/06-progress.md` for current state, your assigned task and the Locks table
2. `docs/00-requirements.md` for scope

Then read only what the task touches:

| Task touches | Read |
|---|---|
| Bookings, holds, payments, inventory | `docs/01-booking-core.md` |
| Folders, modules, stack, env vars | `docs/02-architecture.md` |
| Tables, migrations, seed | `docs/03-data-model.md` |
| Enquiries, AI | `docs/04-ai-router.md` |
| Any UI | `docs/05-design-system.md` |
| Story scope and AC | `docs/07-backlog.md` |

If code and docs disagree, docs win. To change a decision, stop and ask the scrum master. Never silently rewrite a doc decision.

## Rules
1. Work only on your assigned task, in your own git worktree and branch.
2. Locked areas: `src/db/**` (schema, migrations) and `src/modules/{inventory,booking,payments}/**`. Edit them only if `06-progress.md` (after pulling `main`) names you as owner and the scrum master confirmed it. Otherwise stop and ask.
3. Contracts in each module `index.ts` are frozen. UI builds against `fixtures.ts`. Changing a contract needs scrum master approval.
4. Modules talk only through each module's `index.ts`. No cross module table access, except a shared transaction passed in as `tx`.
5. Every server action and route handler validates input with Zod and calls `requireRole()` or `requireGuestOwner()`.
6. Money is integer paise. Dates are IST `DATE`. Prices are computed only in `modules/pricing`.
7. No secrets in code. New env vars go in `.env.example` (names only) and `docs/02-architecture.md`.
8. Add tests for logic you add. Run `pnpm typecheck && pnpm test` before committing.
9. Small commits: `feat(inbox): render unsorted lane`.
10. After a significant change, update `docs/06-progress.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
