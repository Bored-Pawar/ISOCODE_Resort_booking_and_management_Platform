# 01 Booking Core

LOCKED AREA. One agent at a time. See Locks in `06-progress.md`.

## State machine

```
 (start) --hold ok--> HELD --pay ok, hold valid--> CONFIRMED --staff--> CANCELLED
                       |
                       +--timeout--> EXPIRED (final)
                       |               late payment --> payment REFUND_PENDING, booking stays EXPIRED
                       +--guest abandons--> CANCELLED
```

One room per booking in the MVP: `units` is always 1 (enforced by Zod). Inventory functions still take `units` so the logic stays generic.

| From | To | Trigger | Inventory |
|---|---|---|---|
| none | HELD | step 2 submit | held += units, every night |
| HELD | CONFIRMED | payment success and `hold_expires_at > now()` | held -= units, sold += units |
| HELD | EXPIRED | expiry release | held -= units |
| HELD | CANCELLED | guest cancels | held -= units |
| CONFIRMED | CANCELLED | staff | sold -= units |

EXPIRED and CANCELLED are final. Inventory is only ever taken at hold time.

### Late payment
A successful payment for a booking that is not HELD with a valid hold records `payments.status='REFUND_PENDING'` and a `booking_events` note. Inventory is untouched. Guest sees: "Payment received after your hold expired. It will be refunded. Book again?" To keep this rare: show the HoldTimer, and block starting payment when under 2 minutes remain (offer "refresh hold", which is a normal fresh acquire).

### Transition rules
1. Every transition is one conditional update, e.g.
   `UPDATE bookings SET status='CONFIRMED' WHERE id=$1 AND status='HELD' AND hold_expires_at > now() RETURNING *`.
   Zero rows means another actor moved it; re-read and respond from the current state. This prevents double confirmation.
2. Every transition writes a `booking_events` row in the same transaction.
3. Payment failure does not change booking status. Guest may retry until expiry.
4. Duplicate payments: `payments.provider_payment_id` is UNIQUE. A repeat is a no-op returning the existing result.
5. Payment amount must equal `bookings.total_paise`, else reject.

## Inventory lifecycle

### Acquire hold (one transaction)
1. Release expired holds for this room type and date range.
2. `SELECT * FROM inventory WHERE room_type_id=$1 AND date >= $in AND date < $out ORDER BY date FOR UPDATE` (ordered locks prevent deadlocks).
3. Reject the whole booking if row count is not equal to nights, any night has `allotment - sold - held < units`, or any night is blacked out.
4. Recompute `pricing.quote()` inside the transaction. If its `quoteHash` differs from the hash the guest saw, return `PRICE_CHANGED` with the new quote (no hold taken).
5. `UPDATE inventory SET held = held + $units` for those rows. Insert `bookings` (with `quote_hash`) and `booking_nights` (price snapshot).
6. On deadlock or serialization error, retry once, then return "sold out".

### Release expired holds (idempotent, safe with concurrent callers)
```sql
UPDATE bookings SET status='EXPIRED'
WHERE id IN (SELECT id FROM bookings
             WHERE status='HELD' AND hold_expires_at <= now()
             FOR UPDATE SKIP LOCKED)
RETURNING id;
```
Then decrement `held` for exactly those bookings' nights, same transaction. A booking leaves HELD once, so inventory is released once.

Called: before availability reads, before hold acquire, at confirmation, and by a daily cron as a safety net. Lazy release is the primary mechanism.

### Admin allotment change
`UPDATE inventory SET allotment=$new WHERE ... AND sold + held <= $new`. Return rejected dates with the minimum allowed. App code also enforces `allotment <= room_types.total_units`.

### Blackouts
Block new holds only. Existing bookings stand; admin sees a warning list.

## Pricing and GST
1. `pricing.quote()` is the only price source (site, booking, AI drafts).
2. Per night: rate minus discount share, then GST slab from `tax_slabs` by that value and the stay date's `effective_from`.
3. Quote is frozen in `booking_nights` at hold. Rate changes never alter existing bookings.
4. Promos: pct or flat, validity, min nights, max uses. `used_count` increments at confirm. Concurrent overshoot past `max_uses` is honoured and documented as a known limit.

## Required tests
1. 20 parallel holds on the last unit: exactly 1 succeeds.
2. Multi night booking with one full night rolls back completely.
3. Concurrent double expiry release changes inventory once.
4. Duplicate payment webhook confirms once.
5. Late payment after expiry: REFUND_PENDING, booking stays EXPIRED, inventory unchanged.
6. Allotment cut below committed is rejected.
7. Hold on blackout date is rejected.
8. GST slab correct on both sides of the boundary.
9. Price changed between quote and hold: PRICE_CHANGED, no inventory taken.

## Contracts
How the locked modules compose inside one database transaction (R01). Public contracts in each `index.ts` stay frozen; the helpers below are internal and sit in `internal.ts` next to them. They are not exported from `index.ts` and UI never imports them. Rule 4 (modules talk only through `index.ts`) has this one exception: `booking` may import `pricing/internal` and `inventory/internal`. Signatures exist as stubs that throw "not implemented".

### Transaction owner
1. **`booking` owns every transaction** that spans modules: `acquireHold`, `confirmPayment`, `releaseExpiredHolds`. It opens it with `db.transaction`, and passes the `Tx` (from `@/lib/db`) to helpers. Helpers never open or commit a transaction.
2. `pricing` and `inventory` read and write only their own tables, using the `tx` they are given. This is the "shared transaction passed in as `tx`" exception in CLAUDE.md rule 4.
3. Public reads (`pricing.quote`, `inventory.availability`) use their own connection, no transaction.

### Helper signatures (stubs in the repo)
| Module | Helper | Needed by |
|---|---|---|
| `pricing/internal.ts` | `quoteInTx(tx, input: QuoteInput): Promise<QuoteResult>` | B1, B3 |
| `inventory/internal.ts` | `lockNights(tx, { roomTypeId, checkIn, checkOut, units }): Promise<Ok<{ nights: LockedNight[] }> \| Err<'SOLD_OUT' \| 'BLACKOUT'>>` | B2, B3 |
| `inventory/internal.ts` | `adjustNights(tx, { roomTypeId, dates, heldDelta, soldDelta }): Promise<void>` | B3, B4, B5 |
| `booking/internal.ts` | `releaseExpiredHoldsInTx(tx, { roomTypeId?, checkIn?, checkOut?, now? }): Promise<{ released: number }>` | B3, B4, B5 |
| `booking/index.ts` | `booking.releaseExpiredHolds(): Promise<Ok<{ released: number }>>` (own transaction; cron and lazy expiry). Additive, stubbed | B4 |

`inventory.availability` calls `booking.releaseExpiredHolds()` first (lazy expiry). There is no import cycle: `booking/index` imports `inventory/internal`, and `inventory/index` imports `booking/index`; `inventory/internal` imports nothing from `booking`.

### Lock order
1. Within one transaction: `bookings` rows first (only in expiry, `FOR UPDATE SKIP LOCKED`), then `inventory` rows.
2. Inventory rows are always locked and updated ordered by `(room_type_id, date)` ascending. The MVP is one room type per booking, so this is date ascending.
3. Never lock `inventory` rows out of order, and never take a lock on `payments` before `bookings`. A conditional `UPDATE bookings ... WHERE status='HELD'` is the only booking write in `confirmPayment`.
4. A deadlock or serialization failure (`40P01`, `40001`) retries the whole transaction once, then `acquireHold` returns `SOLD_OUT` (01 step 6).

### `acquireHold` sequence
1. Zod parse, `requireGuestOwner`-style guest check by the caller (guestId comes from the server session only, never the client).
2. `db.transaction`: `releaseExpiredHoldsInTx` (scoped to room type and dates) -> `lockNights` -> `quoteInTx` -> compare `quoteHash` -> `adjustNights(heldDelta: +1)` -> insert `bookings`, `booking_nights`, `booking_events`.
3. Results: `lockNights` error -> `SOLD_OUT` / `BLACKOUT`; `quoteInTx` error -> `NO_RATE` / `PROMO_INVALID` / `OVER_OCCUPANCY` / `INVALID_INPUT`; hash mismatch -> `PRICE_CHANGED` with the new quote. These are the codes in `AcquireHoldResult`.

### Rollback rules
1. Any non-ok helper result, hash mismatch or thrown error **rolls the whole transaction back**. Nothing is half applied, including the expiry release done at the start. That is safe because expiry is lazy and repeated.
2. Business failures are returned (`{ ok: false, code }`), never thrown out of `booking`. Inside, an internal sentinel error triggers the rollback and is mapped to the returned code.
3. Infrastructure errors (connection lost, CHECK violation that should be impossible after `lockNights`) are thrown to the caller after rollback.
4. `confirmPayment`: insert `payments` (unique `provider_payment_id`), conditional update to CONFIRMED, `adjustNights(heldDelta: -1, soldDelta: +1)`, `booking_events`, promo `used_count` increment, in one transaction. A unique violation on `provider_payment_id` is the duplicate-webhook no-op (`ALREADY_CONFIRMED`).

### Which story implements what
B1: `quoteInTx` and public `quote` share one implementation. B2: `availability` plus `lockNights` read logic. B3: `acquireHold`, `adjustNights`. B4: `releaseExpiredHoldsInTx`, `releaseExpiredHolds`, cron route. B5: `confirmPayment`.

## Contract notes (C2)
Clarifications added with the frozen interfaces. They restate decisions above; nothing new is decided.
1. `Quote.quoteHash` = first 32 hex chars of SHA-256 over room type, plan, check-in, check-out, promo (code, kind, value) and per night (date, rate, discount, GST basis points). Occupancy is excluded. See `src/modules/pricing/hash.ts`.
2. `booking.acquireHold({ stay, quoteHash, guestId })` recomputes the quote inside the transaction. Mismatch returns `{ ok: false, code: 'PRICE_CHANGED', quote }` and takes no inventory.
3. `booking.confirmPayment` returns `ok: true` with `outcome` `CONFIRMED`, `ALREADY_CONFIRMED` (duplicate webhook) or `REFUND_PENDING` (late payment). A wrong amount returns `AMOUNT_MISMATCH`. It charges `bookings.total_paise` only.
4. Business failures are returned as `{ ok: false, code }`, never thrown.
5. `acquireHold` can also return `PROMO_INVALID` and `OVER_OCCUPANCY` (from the price recheck) besides `SOLD_OUT`, `BLACKOUT`, `NO_RATE`, `INVALID_INPUT` and `PRICE_CHANGED`. `guestId` is taken from the server session only.
6. `confirmPayment` `REFUND_PENDING` means the payment was handled (recorded for refund) and the booking is **not** confirmed. UI must branch on `outcome`, not only `ok`.

## S1 implementation coordination notes (2026-11-08; no public contract changes)
1. **B3/B4 implementation order:** B3 requires `releaseExpiredHoldsInTx` before acquiring its inventory locks. Implement the internal helper early enough for B3 to work; B4 still owns completing the additive public wrapper, cron, idempotency tests and acceptance criteria. This clarifies work sequencing only.
2. **Pricing and seed:** B1 must repair R09's capped flat-discount allocation and avoid divergent pricing algorithms in seed versus runtime. Prefer shared pure pricing-owned calculations usable by seeded records and `quoteInTx`; keep the existing `Quote` and public `quote` signatures unchanged. Validate snapshot totals, not fresh-rate equality for historical bookings.
3. **Concurrent paths:** Explicitly examine row-lock acquisition across hold, expiry, and confirmation; test expiry-versus-confirm racing and equality at the expiry boundary in addition to the nine mandated cases. An internal algorithm that changes the public error unions, state machine or schema still needs scrum-master approval.
4. **Authentication boundary:** `guestId` remains in the frozen service input, but only a trusted server entry point may populate it from the verified session; never accept it as authoritative from a browser payload.
5. **Payment and stock invariants:** Preserve database `sold + held <= allotment`, immutable booked price snapshots, `REFUND_PENDING` as a handled payment (not confirmed booking), and audit events in the same transaction as each transition. Implement B5 confirmation logic, not the B7 mock gateway.
6. **Database tests:** Use only a verified, isolated `TEST_DATABASE_URL`; the integration suite can reseed/truncate its target. Do not run destructive scripts until the guarded target is confirmed. All nine tests in this document are mandatory, including 20 parallel attempts for the final unit with exactly one successful hold.
