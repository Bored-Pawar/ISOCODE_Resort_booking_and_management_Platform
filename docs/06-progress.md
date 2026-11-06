# 06 Progress

Scrum master: Abhishek. Deadline: 9 Nov 2026, 23:59 IST.
Developers update this file after significant changes. Keep entries one line.

## Ownership of locked areas
Coordination records, not enforcement. The scrum master assigns ownership in chat; developers confirm before editing. Pull `main` before reading this table.

| Area | Paths | Owner | Since |
|---|---|---|---|
| Schema and migrations | `src/db/**` | Claude Code (S0) | 2026-11-07 |
| Booking core | `src/modules/{inventory,booking,payments}/**` | Claude Code (S0) | 2026-11-07 |

## Current sprint
S0: walking skeleton, built by one developer (Claude Code) so the frame is consistent before parallel work starts.
Goal: deployed app where every module exists behind its contract and returns fixtures; schema, seed, auth, CI and UI kit in place.

## S0 tasks (see `07-backlog.md` for AC)
| ID | Task | Owner | Status |
|---|---|---|---|
| F1 | Scaffold | Claude Code | done |
| C1 | Frozen service interfaces + fixtures | Claude Code | done |
| C2 | Quote, hold, payment price contract | Claude Code | done |
| F2 | Schema + migrations | Claude Code | todo |
| F3 | Seed data | Claude Code | todo |
| F4 | Auth and roles | Claude Code | todo |
| F5 | CI | Claude Code | todo |
| F6 | Deploy to Vercel + Neon | Claude Code | todo |
| F7 | UI kit from `05` | Claude Code | todo |
| D1 | Start `docs/tdd-notes.md` | Claude Code | todo |

## Done
1. Docs structure, backlog and design system.

## Blockers
1. Images: scrum master to supply `public/images/*` per shot list in `05`. Until then, use neutral placeholders of the right aspect ratio.

## Decisions log
| Date | Decision |
|---|---|
| 2026-11-06 | Modular monolith on Next.js + TypeScript, Drizzle, Neon, Vercel |
| 2026-11-06 | Booking state machine and inventory rules per `01` |
| 2026-11-06 | AI default provider Gemini free tier; local and rules fallbacks |
| 2026-11-07 | Late payment after expiry: EXPIRED is final, payment REFUND_PENDING, no re-acquire |
| 2026-11-07 | One room per booking in MVP (`units` column kept, validation enforces 1); groups go to enquiry |
| 2026-11-07 | Contracts and fixtures frozen first; UI builds against fixtures |
| 2026-11-07 | `quoteHash` links displayed price to hold; mismatch returns PRICE_CHANGED |
| 2026-11-07 | AI processing via persisted states, `after()`, sweep and Retry; no floating promises |
| 2026-11-07 | Design direction "Quiet estate" per `05` |
| 2026-11-07 | S0 built by a single developer; parallel work starts from S1 |
