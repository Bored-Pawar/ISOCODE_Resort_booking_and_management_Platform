# S2 overnight runbook: multi-room (B10) by Claude Code

Owner tonight: **Claude Code, alone and unattended** (~7 hours). Scrum master is asleep.
What to build: everything in `docs/s2-multiroom-change.md` (sections 1 to 7). That doc is the design; this doc is how to run it.
Codex is idle tonight. For this branch, Claude Code holds all locks (`src/db/**`, pricing, inventory, booking, payments, guest, catalog).

## Hard rules
1. Never touch `main`, never merge a PR, never touch the Neon **production** branch or any production credentials.
2. Approved destructive ops: `db:reset`, `db:migrate`, `db:seed` on the **development** and **test** branches only, through the existing safety guards. Never bypass `src/db/safety.ts`.
3. Do not edit files inside `../resort-claude` or `../resort-codex`. Read only (copying `.env.local` and the two docs is allowed).
4. Do not change the design in `s2-multiroom-change.md`. If something in it is genuinely wrong, choose the smallest safe fix, record it under "Deviations" in the handoff, and continue.
5. If blocked on one part, record it in the handoff and move to the next independent part. Do not stop and wait.
6. If the usage limit pauses you, resume from the handoff file and `git log` when restarted.

## Step 0: preflight
1. `git worktree list`. Confirm `codex/dev` HEAD is `c8c8b76` (or newer) and the Codex worktree is clean. Note the `claude/dev` HEAD.
2. If `claude/dev` has uncommitted changes, do not touch them; use its last commit only and note it.
3. Create the work tree:
   `git worktree add ../resort-multiroom -b claude/multiroom codex/dev`
4. Copy `.env.local` from `../resort-claude`. Run `pnpm install`.
5. `git merge claude/dev` (brings G1 to G3 and anything else committed there). Conflict rules: in `06-progress.md` and `tdd-notes.md` keep both sides' entries; in code, keep both features working; never drop a Codex B1 to B5 fix.
6. Copy `docs/s2-multiroom-change.md` and this runbook from `../resort-claude/docs/` into `docs/`. Commit: `docs: S2 multi-room change and runbook`.
7. Baseline gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Record results in `docs/s2-multiroom-handoff.md` (create it now, keep updating it).

## Step 1: build, in this order, small commits each
1. **Contract** (change doc section 3): types, Zod schemas, 1-line and 2-line fixtures, `RoomType.maxOccupancy`. Update `docs/01-booking-core.md`, `docs/03-data-model.md`, add story B10 to `docs/07-backlog.md`, decision rows in `docs/06-progress.md` (multi-room approved; one-room rule superseded; lock holder for this branch).
2. **Schema + seed** (section 2): migration `0001_*`, seed values, ~5 multi-room seed bookings built through the real quote, shared `CA-XXXXX` ref generator. Then reset, migrate and seed **development** and **test**.
3. **Pricing** (section 4 rules 1 to 3, 6).
4. **Inventory** helpers (rule 4).
5. **Booking** hold, expiry, confirm, read (rules 4 and 5) and minor fixes (section 5).
6. **Tests** (section 6): adapt existing, add all 8 new. Run `pnpm test:integration` against `TEST_DATABASE_URL`. Fix until green.
7. **UI**: real `catalog.maxOccupancy`; G2 and G3 adapted to the new quote shape and occupancy rule; "add another room" copy; Reserve carries a cart in the URL with stable line order (max 4, not above availability).
8. **B6 step 1 only**: `/book` page that reads the cart from the URL and lets the guest edit it as a room cart: add or remove rooms (1 to 4), pick type and plan per line, assign adults and children per line, a "guests left to place" counter from the original search, a live quote (per line and total), and per line errors via `lineIndex`. Continue is disabled until the counter is zero and the quote is valid. Continue goes to `/book/details` which shows a clear "next step coming" placeholder (B6 steps 2 and 3 are tomorrow's work). Follow `docs/05-design-system.md` and the frontend-design skill; server components load data; client components import only types from locked modules.

## Step 2: verify
1. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build && pnpm test:integration`.
2. `pnpm dev`: open `/`, `/rooms`, `/rooms/<slug>`, `/book?...` at desktop and 375px. Screenshots to `docs/screenshots/b10-*.png`.
3. **Independent check**: spawn a review subagent with no context from your work. Give it this runbook, the change doc and the diff `git diff codex/dev...HEAD`. Ask for blockers and majors only against change-doc sections 1 to 6. Fix blockers and majors; list the rest in the handoff.

## Step 3: hand off
1. Push `claude/multiroom` to origin (backup only). No PR, no merge.
2. `docs/s2-multiroom-handoff.md`, under 80 lines: commits, what works (with evidence), test counts (unit and integration, actually run), deviations, open items, the exact merge order for the morning.
3. Update `docs/06-progress.md` and `docs/tdd-notes.md`. Commit and push.

## Morning merge order (for the scrum master)
1. PR `codex/dev` (B3 to B5) into `main`, CI green, merge.
2. Review the `claude/multiroom` handoff, then PR `claude/multiroom` into `main`, CI green, merge.
3. Fallback if B10 is broken: keep `main` at B3 to B5 single-room and cherry-pick nothing.
