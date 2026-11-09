# Final check (S3 Phase 6)

Run on 9 Nov 2026. Code: `main` at 38ff922 (Phases 0 to 5 and 7 merged) plus this branch's `scripts/acceptance.mts` and, for the AI runs, `AI_MODEL=openai/gpt-oss-120b` in `.env.local`. Development database reseeded first (`pnpm db:seed`: 4 room types, 2,160 rates, 720 inventory rows, 30 bookings, 30 enquiries, 5 users). Integration tests on the guarded `TEST_DATABASE_URL` (test-claude), one file at a time with `AI_PROVIDER=rules`.

## Gates
| Check | Command | Result |
|---|---|---|
| Typecheck, lint, format | `pnpm typecheck && pnpm lint && pnpm format:check` | pass (on the final commit of this branch, which adds the acceptance script) |
| Unit | `pnpm test` | **735 / 735** (78 files) |
| Build | `pnpm build` | pass |
| Integration (PostgreSQL) | `AI_PROVIDER=rules pnpm exec vitest run --project integration --no-file-parallelism <file>`, each of 20 files | **176 / 176**: admin-allotment 9, admin-availability 8, admin-promos 8, admin-rates 8, admin-warning 3, ai-processing 17, ai-routing 17, auth 4, booking 28, booking-list 3, cancel 6, hold-idempotency 5, inbox 18, inventory 12, list-query-depth 1, multiroom 9, pricing 6, schema 5, seed 7, staff-read 2 |
| Playwright | `E2E_BASE_URL=http://localhost:3300 pnpm test:e2e` against `DEV_TOOLS_ENABLED=true pnpm dev` | **6 / 6**: guest searches, builds a stay, signs up inline, holds, pays, sees the confirmation (`e2e/booking.spec.ts`); staff opens ENQ-4411, edits the draft, approves and sends, sees it replied and in the outbox (`e2e/inbox.spec.ts`); security headers, no CSP violation or console error on public and staff pages, failed login keeps the email (`e2e/headers.spec.ts`, 4 tests) |
| UX walk (Phase 5) | `scripts/ux-walk.mjs` | 72 checks, 0 findings (`docs/screenshots/final/README.md`) |

The integration run was on `main` at b8b589f; Phase 5 (merged after) changes only colour tokens, two components and scripts, which the PostgreSQL suite does not touch. Unit, build and Playwright ran on 38ff922.

## Acceptance walk of the core slice
`scripts/acceptance.mts` against the dev server, provider from `.env.local` (Groq, `openai/gpt-oss-120b`): **24 / 24**. Raw: [`final-check-acceptance.json`](final-check-acceptance.json).

| # | Check | Result | Evidence |
|---|---|---|---|
| A1 | search shows rooms with prices incl. GST | pass | /rooms with dates: rupee prices, GST, rooms left |
| A2 | room page shows availability and price incl. GST | pass | /rooms/garden-villa with dates |
| A3 | roles: sales cannot open Rates or the Unsorted lane | pass | rates 403 screen=true, unsorted tab shown=false, active lane "Inbox Inbox Mine" |
| A4 | roles: signed-out /admin goes to staff login | pass | /admin/login?next=%2Fadmin |
| A5 | GM pages load: rates, allotment, promos, bookings | pass | /admin/rates, /admin/allotment, /admin/promos, /admin/bookings |
| A6 | web form enquiry stored with a reference | pass | ENQ-4HZZL |
| A7.1 | inbound email accepted (ENQ-4410) | pass | 200 ENQ-WBCQL |
| A7.2 | inbound whatsapp accepted (ENQ-4411) | pass | 200 ENQ-DDE4J |
| A7.3 | inbound email accepted (ENQ-4412) | pass | 200 ENQ-4SCXP |
| A7.4 | inbound email accepted (complaint) | pass | 200 ENQ-T67U9 |
| A7.5 | inbound whatsapp accepted (ambiguous) | pass | 200 ENQ-CPFJW |
| A7.6 | inbound with a wrong secret is refused | pass | 401 |
| A8 ENQ-4410 | brief enquiry: wedding to sales | pass | ai=ok category=wedding confidence=0.96 lane=sorted owner=sales draft=no quote |
| A10 ENQ-4410 | a draft exists and is not sent or approved | pass | sentAt=null approvedBy=null |
| A8 ENQ-4411 | brief enquiry: room to reservations | pass | ai=ok category=room confidence=0.97 lane=sorted owner=reservations draft=with server quote |
| A9 | room enquiry draft carries a server quote | pass | ai=ok category=room confidence=0.97 lane=sorted owner=reservations draft=with server quote |
| A10 ENQ-4411 | a draft exists and is not sent or approved | pass | sentAt=null approvedBy=null |
| A8 ENQ-4412 | brief enquiry: offsite to sales | pass | ai=ok category=offsite confidence=0.96 lane=sorted owner=sales draft=no quote |
| A10 ENQ-4412 | a draft exists and is not sent or approved | pass | sentAt=null approvedBy=null |
| A8 complaint | complaint flagged and alerts the GM | pass | ai=ok category=complaint confidence=0.96 lane=sorted owner=gm draft=no quote gmAlert=true |
| A10 complaint | a draft exists and is not sent or approved | pass | sentAt=null approvedBy=null |
| A8 ambiguous | low confidence goes to unsorted (no owner) | pass | ai=ok category=other confidence=0.60 lane=unsorted owner=null draft=no quote |
| A10 ambiguous | a draft exists and is not sent or approved | pass | sentAt=null approvedBy=null |
| A11 | web form enquiry processed | pass | ai=ok category=room lane=sorted owner=reservations |

Covered elsewhere (cited, not re-run by the script):
| Slice item | Evidence |
|---|---|
| 3 step booking, test payment, confirmation | `e2e/booking.spec.ts` (above); `tests/integration/booking.test.ts` 28, `multiroom.test.ts` 9, `hold-idempotency.test.ts` 5 |
| Rate and allotment admin, blackout (offline), promo admin (writes) | `tests/integration/admin-rates.test.ts` 8, `admin-allotment.test.ts` 9, `admin-availability.test.ts` 8, `admin-promos.test.ts` 8, `admin-warning.test.ts` 3 |
| One-click re-route | `tests/integration/inbox.test.ts` (category and owner together, one event, complaints keep the GM) |
| Approve and send | `e2e/inbox.spec.ts`; `inbox.test.ts` (concurrent sends give one `sent_at`; stale draft refused) |
| Roles enforced in services | `tests/integration/inbox.test.ts`, `staff-read.test.ts`, the admin files; unit `src/lib/auth/permissions.test.ts` |

## The three brief enquiries
Re-ingested through the real inbound webhooks and processed by the live pipeline:
| Brief | Channel | Expected | Result |
|---|---|---|---|
| ENQ-4410 wedding, Feb 2027, 250 guests | email | wedding, sales | wedding, sales, confidence 0.96 |
| ENQ-4411 villa 14 to 16 Nov, 2 adults and a child | WhatsApp | room, reservations, draft with a server quote | room, reservations, 0.95, draft with a server quote |
| ENQ-4412 team of 45, January offsite | email | offsite, sales | offsite, sales, 0.96 |

## Bug found and mitigated in this phase
**`openai/gpt-oss-20b` (the Phase 0 suggested model) sometimes answers with the JSON schema itself** instead of a classification (`AI_NoObjectGeneratedError`, "response did not match schema"), seen in a redacted probe run by hand (not committed; it printed only the error class and a truncated, key-redacted message). This is the likely cause of most of the 9 R5 `INVALID_RESPONSE` fallbacks; the eval records no sub-reason, so it is not proven for each. In the first acceptance run (its JSON was overwritten, not kept) ENQ-4412 fell back to unsorted the same way (23 / 24). Mitigation (configuration, no code): `AI_MODEL=openai/gpt-oss-120b`, which still had one `INVALID_RESPONSE` in 30 (ENQ-4397, offsite, to unsorted). The 30 case evaluation on 120b ([`eval/ai-evaluation-live-model-120b.json`](eval/ai-evaluation-live-model-120b.json)): valid answers 29/30 (20b: 21/30), correct category 28/30 (20b: 20/30), fallback 1/30 (20b: 9/30), unsorted 6/30, complaint recall 5/5, draft template fallback 7/30, HTTP 429 4 (absorbed by key failover), median / p95 latency 1716 / 2510 ms. Per category, end to end after fallback (ENQ-4397 counts as correct through the rules fallback): room 9/9, wedding 6/6, offsite 5/5, complaint 5/5, other 4/5. The final acceptance run on 120b (with the tightened checks) passed 24 / 24. `.env.example`, `04`, `02`, `deployment.md` and `README.md` now suggest 120b; in `.env.local` only the `AI_MODEL` line changed (keys untouched).

Also observed: Groq's free tier limits tokens per minute per organisation (8,000 TPM; one classification is about 2,500 tokens). If all four keys belong to the same organisation, rotation does not add capacity; keys from separate organisations do.

## Not verified here
- The one-click re-route in the browser (service-level only, `inbox.test.ts`). Extraction is shown indirectly (ENQ-4411's grounded dates and party give a server quote).
- Admin writes through the UI (service-level integration tests only; A5 checks the pages load).
- Real email, WhatsApp and payment providers (mocked by design).
- The deployed site (not deployed; Phase 7 prepared it).
