import { sql } from "drizzle-orm";
import { z } from "zod";
import type { PgInsertValue } from "drizzle-orm/pg-core";
import { bookings, bookingEvents, bookingNights, bookingRooms } from "@/db/schema";
import { getDb, type Tx } from "@/lib/db";
import { eachNight } from "@/lib/dates";
import { lockNights, adjustNights, mergeDemand } from "@/modules/inventory/internal";
import { quoteInTx, promoIdInTx } from "@/modules/pricing/internal";
import { releaseExpiredHoldsInTx } from "./internal";
import { readBooking } from "./read";
import { isRefCollision, newBookingRef, REF_MAX_ATTEMPTS } from "./ref";
import { RollbackResult, holdMinutes, isTransactionConflict } from "./transaction";
import type { AcquireHoldInput, AcquireHoldResult } from "./index";

/**
 * Inserts the booking with a fresh CA-XXXXX ref. A unique violation on the ref (23505) is retried
 * inside a savepoint, so the surrounding hold transaction stays usable (B10 minor fix 1).
 */
async function insertWithRef(tx: Tx, values: (ref: string) => PgInsertValue<typeof bookings>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await tx.transaction(async (sp) => {
        const [row] = await sp.insert(bookings).values(values(newBookingRef())).returning();
        return row;
      });
    } catch (error) {
      if (isRefCollision(error) && attempt < REF_MAX_ATTEMPTS) continue;
      throw error;
    }
  }
}

/** Input has already passed the frozen schema. guestId is supplied by the trusted server action. */
export async function acquireHold(input: AcquireHoldInput): Promise<AcquireHoldResult> {
  if (!z.uuid().safeParse(input.guestId).success) return { ok: false, code: "INVALID_INPUT" };
  const minutes = holdMinutes();
  const { stay } = input;
  const dates = eachNight(stay.checkIn, stay.checkOut);
  // B10 rule 4: demand = count of lines per room type.
  const demand = mergeDemand(stay.rooms.map((r) => ({ roomTypeId: r.roomTypeId, units: 1 })));
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().transaction(async (tx): Promise<AcquireHoldResult> => {
        await releaseExpiredHoldsInTx(tx, {
          roomTypeIds: demand.map((d) => d.roomTypeId),
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
        });
        const stock = await lockNights(tx, {
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
          demand,
        });
        if (!stock.ok)
          // Frozen contract: only SOLD_OUT may name the room type; BLACKOUT stays bare.
          throw new RollbackResult(
            stock.code === "BLACKOUT" ? { ok: false, code: "BLACKOUT" } : stock,
          );
        const result = await quoteInTx(tx, stay);
        if (!result.ok) throw new RollbackResult(result);
        const q = result.quote;
        if (q.quoteHash !== input.quoteHash) {
          throw new RollbackResult({ ok: false, code: "PRICE_CHANGED", quote: q });
        }
        await adjustNights(tx, {
          changes: demand.map((d) => ({
            roomTypeId: d.roomTypeId,
            dates,
            heldDelta: d.units,
            soldDelta: 0,
          })),
        });
        const promoId = q.promo ? await promoIdInTx(tx, q.promo.code) : null;
        const b = await insertWithRef(tx, (ref) => ({
          ref,
          guestId: input.guestId,
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
          status: "HELD",
          holdExpiresAt: sql`clock_timestamp() + ${minutes} * interval '1 minute'`,
          quoteHash: q.quoteHash,
          promoId,
          subtotalPaise: q.subtotalPaise,
          discountPaise: q.discountPaise,
          gstPaise: q.gstPaise,
          totalPaise: q.totalPaise,
        }));
        const rooms = await tx
          .insert(bookingRooms)
          .values(
            q.lines.map((l) => ({
              bookingId: b.id,
              lineNo: l.lineNo,
              roomTypeId: l.roomTypeId,
              ratePlanId: l.ratePlanId,
              adults: l.adults,
              children: l.children,
              subtotalPaise: l.subtotalPaise,
              discountPaise: l.discountPaise,
              gstPaise: l.gstPaise,
              totalPaise: l.totalPaise,
            })),
          )
          .returning({ id: bookingRooms.id, lineNo: bookingRooms.lineNo });
        const roomId = new Map(rooms.map((r) => [r.lineNo, r.id]));
        await tx
          .insert(bookingNights)
          .values(
            q.lines.flatMap((l) =>
              l.nights.map((night) => ({ bookingRoomId: roomId.get(l.lineNo)!, ...night })),
            ),
          );
        await tx.insert(bookingEvents).values({
          bookingId: b.id,
          fromStatus: null,
          toStatus: "HELD",
          actor: `guest:${input.guestId}`,
          note:
            q.lines.length === 1 ? "Hold acquired" : `Hold acquired for ${q.lines.length} rooms`,
        });
        return { ok: true, booking: (await readBooking(tx, b.id))! };
      });
    } catch (error) {
      if (error instanceof RollbackResult) return error.result as AcquireHoldResult;
      if (isTransactionConflict(error)) {
        if (attempt === 0) continue;
        return { ok: false, code: "SOLD_OUT" };
      }
      throw error;
    }
  }
}
