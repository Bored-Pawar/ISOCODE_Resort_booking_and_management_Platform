import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { bookings, bookingNights, bookingEvents } from "@/db/schema";
import { getDb } from "@/lib/db";
import { lockNights, adjustNights } from "@/modules/inventory/internal";
import { quoteInTx, promoIdInTx } from "@/modules/pricing/internal";
import { releaseExpiredHoldsInTx } from "./internal";
import { readBooking } from "./read";
import { RollbackResult, holdMinutes, isTransactionConflict } from "./transaction";
import type { AcquireHoldInput, AcquireHoldResult } from "./index";

/** Input has already passed the frozen schema. guestId is supplied by the trusted server action. */
export async function acquireHold(input: AcquireHoldInput): Promise<AcquireHoldResult> {
  if (!z.uuid().safeParse(input.guestId).success) return { ok: false, code: "INVALID_INPUT" };
  const minutes = holdMinutes();
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().transaction(async (tx): Promise<AcquireHoldResult> => {
        const { stay } = input;
        await releaseExpiredHoldsInTx(tx, stay);
        const stock = await lockNights(tx, { ...stay, units: 1 });
        if (!stock.ok) throw new RollbackResult(stock);
        const result = await quoteInTx(tx, stay);
        if (!result.ok) throw new RollbackResult(result);
        const q = result.quote;
        if (q.quoteHash !== input.quoteHash) {
          throw new RollbackResult({ ok: false, code: "PRICE_CHANGED", quote: q });
        }
        await adjustNights(tx, {
          roomTypeId: stay.roomTypeId,
          dates: stock.nights.map((n) => n.date),
          heldDelta: 1,
          soldDelta: 0,
        });
        const [b] = await tx
          .insert(bookings)
          .values({
            ref: `CA-${randomBytes(8).toString("hex").toUpperCase()}`,
            guestId: input.guestId,
            roomTypeId: stay.roomTypeId,
            ratePlanId: stay.ratePlanId,
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
            units: 1,
            adults: stay.adults,
            children: stay.children ?? 0,
            status: "HELD",
            holdExpiresAt: sql`clock_timestamp() + ${minutes} * interval '1 minute'`,
            quoteHash: q.quoteHash,
            promoId: q.promo ? await promoIdInTx(tx, q.promo.code) : null,
            subtotalPaise: q.subtotalPaise,
            discountPaise: q.discountPaise,
            gstPaise: q.gstPaise,
            totalPaise: q.totalPaise,
          })
          .returning();
        await tx
          .insert(bookingNights)
          .values(q.nights.map((night) => ({ bookingId: b.id, ...night })));
        await tx.insert(bookingEvents).values({
          bookingId: b.id,
          fromStatus: null,
          toStatus: "HELD",
          actor: `guest:${input.guestId}`,
          note: "Hold acquired",
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
