import { eq, sql } from "drizzle-orm";
import { bookingEvents, bookings } from "@/db/schema";
import { getDb } from "@/lib/db";
import { adjustNights } from "@/modules/inventory/internal";
import { bookingNightChanges, releaseExpiredHoldsInTx } from "./internal";
import { readBooking } from "./read";
import { isTransactionConflict, RollbackResult } from "./transaction";
import type { BookingActor, BookingStatus, CancelHeldResult } from "./index";

/**
 * Guest abandons a hold (01: HELD -> CANCELLED, held -= lines). One booking-owned transaction:
 * targeted lazy expiry first (an expired hold ends EXPIRED, not CANCELLED), then one conditional
 * UPDATE on the booking row (owner, HELD, unexpired), then ordered inventory release and the
 * audit event. Same lock order as expiry and confirmation: booking row, then inventory.
 * Zero rows means another actor moved it: the current state is returned as NOT_HELD.
 */
export async function cancelHeld(
  bookingId: string,
  actor: BookingActor,
): Promise<CancelHeldResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().transaction(async (tx): Promise<CancelHeldResult> => {
        const [row] = await tx
          .select({ guestId: bookings.guestId })
          .from(bookings)
          .where(eq(bookings.id, bookingId));
        if (!row) throw new RollbackResult({ ok: false, code: "NOT_FOUND" });
        if (actor.role !== "guest" || actor.userId.toLowerCase() !== row.guestId)
          throw new RollbackResult({ ok: false, code: "FORBIDDEN" });

        await releaseExpiredHoldsInTx(tx, { bookingId });
        const moved = await tx.execute<{ id: string; check_in: string; check_out: string }>(sql`
          UPDATE bookings SET status = 'CANCELLED', hold_expires_at = NULL
          WHERE id = ${bookingId}::uuid AND guest_id = ${row.guestId}::uuid
            AND status = 'HELD' AND hold_expires_at > clock_timestamp()
          RETURNING id, check_in::text, check_out::text
        `);
        const current = moved[0];
        if (!current) {
          const b = (await readBooking(tx, bookingId))!;
          return { ok: false, code: "NOT_HELD", status: b.status as BookingStatus, booking: b };
        }
        await adjustNights(tx, {
          changes: await bookingNightChanges(
            tx,
            [{ id: current.id, checkIn: current.check_in, checkOut: current.check_out }],
            (units) => ({ heldDelta: -units, soldDelta: 0 }),
          ),
        });
        await tx.insert(bookingEvents).values({
          bookingId,
          fromStatus: "HELD",
          toStatus: "CANCELLED",
          actor: `guest:${row.guestId}`,
          note: "Hold cancelled by the guest before payment",
        });
        return { ok: true, booking: (await readBooking(tx, bookingId))! };
      });
    } catch (error) {
      if (error instanceof RollbackResult) return error.result as CancelHeldResult;
      if (isTransactionConflict(error) && attempt === 0) continue;
      throw error;
    }
  }
}
