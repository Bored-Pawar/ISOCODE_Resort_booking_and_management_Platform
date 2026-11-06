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
