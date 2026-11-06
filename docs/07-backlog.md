# 07 Backlog (full scope of work)

Assignments are decided by the scrum master at the start of each story. Any developer can take any story; whoever did not build it reviews it.

**Guiding rule:** a smaller app with correct bookings, reliable AI routing, a polished responsive UI and passing tests beats a larger unfinished one.

## Priority
| Level | Meaning | Rule |
|---|---|---|
| **P0** | Assessment critical. The core build from the brief. | Must be done, tested and deployed before any P1 starts. |
| **P1** | Scores well, small cost. | Only after all P0 is green on `main`. |
| **P2** | Optional depth. | Only if time is left on Monday. |

Points: 1 trivial, 2 small, 3 medium, 5 large, 8 hard.

## Workflow per story
1. **Plan:** pull `main`, confirm AC, dependencies and the contracts used (section C). Write a 5 to 10 line note in the PR description: files, functions, tests.
2. **Implement:** own worktree and branch `<id>-short-name`. Small commits.
3. **Verify:** `pnpm typecheck && pnpm test`, check edge cases and role checks.
4. **Review:** the other developer checks against AC and the checklist at the bottom.
5. **Merge:** into `main` only when CI is green.
6. **Update:** `06-progress.md`, plus the doc notes in the Definition of Done.

## Definition of Done (every story)
1. AC met, no dead buttons, loading, empty and error states present.
2. Tests for the logic added, CI green.
3. Any new decision or assumption added to `06-progress.md` (decisions log) or `00` (assumptions).
4. UI stories: one screenshot saved to `docs/screenshots/<id>.png` for the TDD.
5. Interface change? Only through the contract rule below.

## Coordination rules
1. **Contracts first.** Service interfaces and sample responses in section C are frozen before feature work. Implementations can change freely behind them. Changing a contract needs scrum master approval and a note in `06`.
2. **Mock first frontend.** UI stories build against the fixtures in `src/modules/*/fixtures.ts`, then switch to the real service when it merges. Nobody waits on a backend merge to start a screen.
3. **Locks are coordination records, not enforcement.** The scrum master assigns ownership of locked areas (`src/db/**`, `src/modules/{inventory,booking,payments}/**`) in chat and records it in `06`. Developers confirm ownership with the scrum master before editing. Pull `main` before reading the table.
4. **Merge often.** Rebase on `main` at least every few hours; no branch lives longer than one sprint.

---

## C Contracts (do first)
| ID | Story | AC | Pts | P | Depends |
|---|---|---|---|---|---|
| C1 | As a dev, I have frozen service interfaces | TS types and function signatures in each module `index.ts` for: `pricing.quote`, `inventory.availability`, `booking.acquireHold`, `booking.confirmPayment`, `booking.get`, `enquiries.ingest`, `aiRouter.process`. Each with a `fixtures.ts` of realistic sample responses. Stub implementations return fixtures. | 3 | P0 | F1 |
| C2 | As a dev, quote, hold and payment share one price contract | `Quote` type includes `quoteHash` (hash of room type, plan, dates, promo, rates and slabs used). `acquireHold(quoteHash)` recomputes the quote inside the transaction; if the hash differs it returns `PRICE_CHANGED` with the new quote and the UI shows "price updated". Booking stores the snapshot; payment charges `bookings.total_paise` only. | 2 | P0 | C1 |

## F Foundation
| ID | Story | AC | Pts | P | Depends |
|---|---|---|---|---|---|
| F1 | As a dev, I have a scaffolded app | Next.js + TS strict, Tailwind, shadcn, ESLint, Prettier, Vitest, pnpm scripts, module folders with `index.ts` | 2 | P0 | |
| F2 | As a dev, I have the schema | Drizzle schema per `03`, migrations run on Neon, all CHECKs and indexes | 3 | P0 | F1 |
| F3 | As a dev, I have realistic seed data | Room types (64 + 12 keys), photos, 180 days of rates and inventory, tax slabs, promos, users, 30 bookings, 30 labelled enquiries | 3 | P0 | F2 |
| F4 | As a user, I sign in by role | Auth.js credentials, bcrypt, `requireRole()`, `requireGuestOwner()`, staff login, guest sign up and login | 3 | P0 | F2 |
| F5 | As a dev, CI checks every PR | GitHub Action: typecheck, lint, unit and Postgres integration tests | 2 | P0 | F1 |
| F6 | As a reviewer, I can open the live app | Vercel + Neon deploy, env vars set, seeded. Deployed on day 1 and redeployed on every merge. | 2 | P0 | F3 |
| F7 | As a dev, I have the UI kit | Tokens from `05`, guest and staff layout shells, Button, Input, Card, Skeleton, EmptyState, ErrorState, Toast | 3 | P0 | F1, design session |

## G Guest browsing
| ID | Story | AC | Pts | P | Depends |
|---|---|---|---|---|---|
| G1 | As a guest, I land on a page that sells the estate and search dates | Hero, short story, room highlights, date range + guests picker, validation, URL params, meets perf budget | 3 | P0 | F7, C1 |
| G2 | As a guest, I see available rooms with prices | Per room type: photo, total incl. GST for the dates, sold out state, over occupancy shows "send a group enquiry" | 3 | P0 | G1, C1 |
| G3 | As a guest, I see a room detail page | Gallery (optimised), amenities, rate plans with totals and tax breakdown, availability, Book button | 3 | P0 | G2 |

## B Booking core (locked area)
| ID | Story | AC | Pts | P | Depends |
|---|---|---|---|---|---|
| B1 | As the system, I quote prices from one place | `pricing.quote()`: nightly rates, promo, GST slab per night, totals in paise, `quoteHash`; tests incl. slab boundary | 3 | P0 | C2, F2 |
| B2 | As the system, I report availability | `inventory.availability()`, lazy expiry first, respects blackouts | 2 | P0 | F2 |
| B3 | As the system, I hold a room atomically | `acquireHold()` per `01`: ordered `FOR UPDATE`, all nights or rollback, price recheck via hash, snapshot nights, retry once; tests 1, 2, 7 | 8 | P0 | B1, B2 |
| B4 | As the system, I release expired holds safely | `releaseExpiredHolds()` with `SKIP LOCKED`, idempotent, cron route; test 3 | 3 | P0 | B3 |
| B5 | As the system, I confirm payment exactly once | State machine, conditional updates, `booking_events`, duplicate webhook no-op, late payment REFUND_PENDING; tests 4, 5 | 5 | P0 | B3 |
| B6 | As a guest, I complete a 3 step booking | Step 1 room and dates, step 2 details + inline sign up + DPDP consent, step 3 pay; hold countdown; payment gate under 2 min | 5 | P0 | B3, F4, F7 |
| B7 | As a guest, I pay in test mode | Mock gateway: success, failure, timeout; webhook to B5; failure allows retry | 3 | P0 | B5 |
| B8 | As a guest, I get a confirmation | Ref, stay, price and GST breakdown, check-in note (passport at desk for foreign guests), mock email in outbox | 2 | P0 | B5 |
| B9 | As a guest, I see and manage my bookings | List and detail, owner only, cancel a held booking | 2 | P1 | B8, F4 |

## A Admin: rates and inventory
| ID | Story | AC | Pts | P | Depends |
|---|---|---|---|---|---|
| A1 | As reservations, I edit daily rates | Grid of room types x 30 days, bulk set by range and weekdays, validation | 5 | P0 | C1, F7 |
| A2 | As reservations, I set website allotment | Grid with allotment, sold, held; bulk set; cut below committed rejected per date; cap at total units | 5 | P0 | B2 |
| A3 | As reservations, I manage blackouts | Create and delete ranges; warning list of existing bookings | 2 | P1 | B2 |
| A4 | As reservations, I manage simple promo codes | List, create, deactivate; pct or flat, validity, min nights, max uses | 2 | P1 | B1 |
| A5 | As reservations, I see bookings | List with filters, detail with event timeline, refund pending list | 3 | P1 | B5 |
| A6 | As GM, I configure GST slabs | Edit table with effective from date (seeded slabs are enough for P0) | 1 | P2 | B1 |
| A7 | As reservations, I export daily bookings | CSV, manual download and cron, idempotent per day | 2 | P2 | B5 |

## Q Enquiries
| ID | Story | AC | Pts | P | Depends |
|---|---|---|---|---|---|
| Q1 | As the system, every channel lands in one place | `enquiries.ingest()` for web, email, WhatsApp; saves the row with `ai_status='pending'` before any AI call | 2 | P0 | F2, C1 |
| Q2 | As a guest, I send an enquiry from the site | Short form, validation, consent, success state | 2 | P0 | Q1, F7 |
| Q3 | As a demo user, I simulate email and WhatsApp | Webhook routes with secret header, staff "simulate inbound" panel with presets | 2 | P0 | Q1 |
| Q4 | As staff, I work the inbox | Lanes: mine, by owner, unsorted; badges for channel, category, confidence, complaint, AI status; filters; empty states | 5 | P0 | C1, F4, F7 |
| Q5 | As staff, I open an enquiry and fix routing | Raw message, extracted fields (editable), summary, timeline; one click re-route logged in `enquiry_events` | 3 | P0 | Q4 |
| Q6 | As staff, I approve a draft | Edit, regenerate, approve and "send" to mock outbox; never auto sent; sets `first_reply_at` | 2 | P0 | Q5, R4 |
| Q7 | As GM, I am alerted to complaints and unsorted items | Notification bell, count, list, mark read | 2 | P0 | R3 |
| Q8 | As GM, I see response metrics | Median first reply, unsorted count, enquiries by category | 2 | P1 | Q6 |
| Q9 | As a guest, I send a structured wedding or event enquiry | Event type, dates, guests, budget, needs; routed to sales with fields prefilled | 3 | P2 | Q1 |

## R AI router
| ID | Story | AC | Pts | P | Depends |
|---|---|---|---|---|---|
| R1 | As the system, I can call any provider | `provider.ts`: google, local, anthropic, rules via env; 10 s timeout, one retry | 2 | P0 | F1 |
| R2 | As the system, AI processing is reliable on serverless | Explicit states `pending → processing → ok / fallback / failed` with `ai_attempts` and `ai_last_error`. Processing runs via Next.js `after()` (kept alive by the platform), plus a sweep that reprocesses rows stuck in `pending` or `processing` over 2 minutes (runs on inbox load and by cron). Failed rows stay visible with a Retry button. No reliance on a floating promise. | 3 | P0 | Q1, R1 |
| R3 | As the system, I classify, extract and route | `generateObject` + Zod, PII stripped, rules fallback; deterministic routing: confidence < 0.70 or fallback goes unsorted, complaint always notifies GM; tests | 5 | P0 | R2 |
| R4 | As the system, I draft replies with real prices | `{{QUOTE}}` filled from `pricing.quote()`, price guard rejects model numbers, template fallback; tests | 5 | P0 | R3, B1 |
| R5 | As the team, we measure AI quality | `pnpm eval:ai` on 30 labelled enquiries, results saved for the TDD | 2 | P1 | R3, F3 |

## H Quality (continuous, final check on Monday)
| ID | Story | AC | Pts | P | Depends |
|---|---|---|---|---|---|
| H1 | Playwright happy paths | Guest books and pays; staff approves a draft | 3 | P0 | B8, Q6 |
| H2 | Security pass | Role check in every action, Zod everywhere, no secrets, rate limit on login and forms, security headers | 2 | P0 | all P0 |
| H3 | Performance pass | Lighthouse Slow 4G on home and room page meets budget | 2 | P0 | G3 |
| H4 | States and mobile audit | Every screen at 375px, all states, no dead buttons | 2 | P0 | all screens |
| H5 | Accessibility pass | Focus, labels, AA contrast, keyboard booking flow | 1 | P1 | all screens |

## D Documentation (continuous, packaged on Monday)
| ID | Story | AC | Pts | P | Depends |
|---|---|---|---|---|---|
| D1 | Running TDD notes | `docs/tdd-notes.md` gets a short entry per merged story: what, why, tradeoffs. Started in S0. | 1 | P0 | ongoing |
| D2 | README and deployment.md | Local run, deploy steps, env var names, demo logins | 2 | P0 | F6 |
| D3 | Final TDD | GitHub and live URL on top; architecture, data model, flows, AI, UI decisions, assumptions, cuts, next steps, test and eval results | 3 | P0 | D1 |
| D4 | Submission ZIP | TDD PDF + deployment.md, under 25 MB | 1 | P0 | D2, D3 |

---

## Scope summary
| Priority | Stories | Points |
|---|---|---|
| P0 | 41 | 122 |
| P1 | 7 | 14 |
| P2 | 3 | 6 |

## Suggested order (walking skeleton first)
1. **S0, tonight:** F1, C1, C2, F2, design session, F7. Then F3, F4, F5, F6. Goal: a deployed app where every module returns fixtures.
2. **S1, Saturday:** booking backbone B1 to B5 in parallel with guest screens G1 to G3 on fixtures. Enquiry intake Q1 to Q3.
3. **S2, Saturday night and Sunday:** B6 to B8, A1, A2, R1 to R4, Q4 to Q7. Switch every screen from fixtures to real services.
4. **S3, Sunday night and Monday:** H1 to H4, D2 to D4, then P1, then P2 if green.

## Review checklist
1. AC met, no dead buttons.
2. Only `index.ts` imports across modules; contracts unchanged or approved.
3. Zod and role check on every entry point.
4. Money in paise, prices only from `pricing`.
5. Tests added, CI green.
6. Loading, empty, error states present.
7. `06-progress.md` and `tdd-notes.md` updated.
