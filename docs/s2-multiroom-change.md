# S2 change: multi-room bookings and occupancy rule (B10)

Approved by scrum master 2026-11-08. Source: `resort-review-b3-b5-multiroom.md` (Opus review). This doc is the single source for the change. Where it conflicts with `01` or `03`, this doc wins until those are updated (part of this task).

Cut-off: if B10 is not merged by **Sun 8 Nov 18:00 IST**, ship single-room (B3–B5 as merged) and log B10 as next step.

## 1. Product rules
1. A room fits a party line when `adults >= 1`, `adults <= max_adults` and `adults + children <= max_occupancy`. `max_children` stays in the schema, not enforced.
2. A booking is one order with 1 to 4 room lines. Every line shares the booking's check-in and check-out. Lines may mix room types; the same type may repeat.
3. One status, one hold, one payment, one total per booking. State machine unchanged.
4. Group enquiry is offered when the party needs more than 4 rooms or stock is insufficient.

## 2. Schema (migration `0001_*`)
1. `room_types`: add `max_occupancy integer NOT NULL`, `CHECK (max_occupancy >= max_adults)`. Seed values: Plantation Room 3, Estate Suite 4, Garden Villa 5, Pool Villa 6 (adjust if max_adults requires).
2. New `booking_rooms`: `id uuid PK`, `booking_id FK bookings ON DELETE CASCADE`, `line_no smallint CHECK (line_no BETWEEN 1 AND 4)`, `room_type_id FK`, `rate_plan_id FK`, `adults CHECK >= 1`, `children CHECK >= 0`, `subtotal_paise`, `discount_paise`, `gst_paise`, `total_paise`, `UNIQUE (booking_id, line_no)`, index `(booking_id)`, index `(room_type_id)`.
3. `booking_nights`: `PK (booking_room_id, date)`, FK to `booking_rooms ON DELETE CASCADE`; drop `booking_id`.
4. `bookings`: drop `room_type_id`, `rate_plan_id`, `units`, `adults`, `children` and the units CHECK. Keep guest, dates, status, hold_expires_at, quote_hash, promo_id, totals, timestamps.
5. No backfill. Dev and test branches hold disposable seed data: approved to run `db:reset` + migrate + seed on **development and test only** after the migration lands. Never production.

## 3. Contracts (frozen after the contract commit)
```ts
// pricing
type QuoteRoomInput = { roomTypeId: string; ratePlanId: string; adults: number; children: number };
type QuoteInput = { checkIn: string; checkOut: string; promoCode?: string; rooms: QuoteRoomInput[] }; // rooms 1..4
type QuoteLine = { lineNo: number; roomTypeId: string; ratePlanId: string; adults: number; children: number;
  nights: QuoteNight[]; subtotalPaise: number; discountPaise: number; gstPaise: number; totalPaise: number };
type Quote = { checkIn: string; checkOut: string; promo: Promo | null; lines: QuoteLine[];
  subtotalPaise: number; discountPaise: number; gstPaise: number; totalPaise: number; quoteHash: string };
// QuoteResult errors: NO_RATE and OVER_OCCUPANCY gain optional { lineIndex: number }

// booking
AcquireHoldInput: { stay: QuoteInput; quoteHash: string; guestId: string } // shape unchanged
AcquireHoldResult: codes unchanged; SOLD_OUT may carry optional { roomTypeId }
Booking: order fields unchanged, plus rooms: BookingRoom[] // line fields + nights; removes roomTypeId, ratePlanId, units, adults, children

// catalog (Claude-owned): RoomType gains maxOccupancy
// unchanged: confirmPayment, availability, releaseExpiredHolds
```
Internal helpers:
1. `lockNights(tx, { checkIn, checkOut, demand: [{ roomTypeId, units }] })` returns nights keyed by type.
2. `adjustNights(tx, { changes: [{ roomTypeId, dates, heldDelta, soldDelta }] })`.
3. `ReleaseExpiredScope.roomTypeIds?: string[]`.

## 4. Rules the implementation must hold
1. GST slab chosen per (line, date) cell on `rate - allocated discount`. Never on a per-date sum across rooms. Order totals = sum of line totals = sum of cells, no re-rounding.
2. Promo: one per booking. Flat promo allocated with the existing R09-safe allocation over cells flattened in order (line_no, then date). `min_nights` per stay. `used_count` +1 per booking.
3. `quoteHash` covers dates, promo and each line in input order (`roomTypeId`, `ratePlanId`, nights). Occupancy excluded. The UI must keep cart order stable between quote and hold.
4. Hold locks every required `(room_type_id, date)` row in **one** SQL statement `ORDER BY room_type_id, date FOR UPDATE`. Never sort or loop per type in JS. Demand = count of lines per type. All or nothing across types; blackout on any type rejects the cart.
5. Expiry and confirm adjust inventory per type in aggregate, from `booking_rooms` x nights. Exactly once, as today.
6. Errors for a specific line carry `lineIndex`.

## 5. Minor fixes folded into this pass
1. One booking ref generator: `CA-` + 5 chars from the seed alphabet, retry on unique violation (23505). Used by hold and seed.
2. Second `HoldElapsedWhileWaiting` in confirm: throw with a message (or allow the third attempt).
3. `02-architecture.md`: record the cron route's `CRON_SECRET` exemption from `requireRole`.
4. `06-progress.md`: mandatory test 6 provisional until A2.
5. Batched expiry sweep: not now; log as known limit.

## 6. Tests
Change: pricing, calculation and hash tests (input shape); `inventory.test.ts` (demand); `booking.test.ts` helpers `hold()`, `reconcile()` (join `booking_rooms`); seed and schema tests; `tests/unit/contracts.test.ts`; booking action tests; G2/G3 `_lib` tests. All 9 mandatory tests keep passing as 1-line carts.

New (Postgres unless noted):
1. Race: cart A `[T1, T2]` vs cart B `[T2, T1]`, 1 unit left of each, 10 parallel rounds: exactly one wins per round, loser `SOLD_OUT`, `pg_stat_database.deadlocks` delta 0, reconcile each round.
2. Race: `[T1, T1]` vs `[T1, T2]`, T1 has 2 left: never exceeds allotment.
3. `2 x T1` with 1 left: `SOLD_OUT`, T2 untouched.
4. Blackout on one type in a 2-type cart rejects the whole cart.
5. Concurrent expiry of a 2-type booking releases both once, 1 event.
6. Confirm a 2-type booking: sold +1 per type per night; duplicate webhook no-op.
7. Unit: flat promo over 2 lines x 3 nights is R09-safe; two Rs 4,000 rooms stay at 5% GST; line order changes the hash; occupancy edges; 5 lines gives `INVALID_INPUT`; `lineIndex` on errors.
8. `PRICE_CHANGED` when one line's rate changes; no stock taken for any type.

## 7. Work split
| Step | Owner | Work | Gate |
|---|---|---|---|
| 0 | Codex | Contract commit: types, Zod schemas, fixtures (1-line and 2-line), stubs; `catalog` type gains `maxOccupancy` (contract file only); update `01`, `03`, `06` decision rows | First commit on branch `codex/multiroom`; pushed so Claude can merge it |
| 1 | Codex | Migration + seed, pricing, inventory, hold, expiry, confirm, read, tests per section 6, minor fixes per section 5 | typecheck, lint, test, build, test:integration all pass |
| 2 | Claude | Real `catalog` `maxOccupancy`; G2/G3 adapt (quote shape, occupancy rule, "add another room" copy, cart link with stable line order, max 4 and not above availability); B6 step 1 as a room cart with guests-left counter | after step 0 is available |
| 3 | Both | Claude (Opus) reviews backend, Codex reviews UI; merge; switch screens to real data | after 1 and 2 |
