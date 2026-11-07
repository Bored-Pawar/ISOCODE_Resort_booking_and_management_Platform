import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { bookings, bookingEvents, payments } from "@/db/schema";
import { getDb, type Tx } from "@/lib/db";
import { eachNight } from "@/lib/dates";
import { adjustNights } from "@/modules/inventory/internal";
import { recordPromoUseInTx } from "@/modules/pricing/internal";
import { releaseExpiredHoldsInTx } from "./internal";
import { readBooking } from "./read";
import { RollbackResult, isTransactionConflict } from "./transaction";
import { confirmationClock } from "./clock";
import type { ConfirmPaymentInput, ConfirmPaymentResult } from "./index";

class HoldElapsedWhileWaiting extends Error {}

async function duplicateResult(tx: Tx, input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.providerPaymentId, input.providerPaymentId));
  if (
    !payment ||
    payment.bookingId !== input.bookingId.toLowerCase() ||
    payment.provider !== input.provider ||
    payment.amountPaise !== input.amountPaise ||
    payment.status === "FAILED"
  ) {
    return { ok: false, code: "INVALID_INPUT" };
  }
  return {
    ok: true,
    outcome: payment.status === "REFUND_PENDING" ? "REFUND_PENDING" : "ALREADY_CONFIRMED",
    booking: (await readBooking(tx, payment.bookingId))!,
  };
}

export async function confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
  if (!z.uuid().safeParse(input.bookingId).success) return { ok: false, code: "NOT_FOUND" };
  let retriedConflict = false;
  let retriedElapsed = false;
  for (;;) {
    try {
      return await getDb().transaction(async (tx): Promise<ConfirmPaymentResult> => {
        const [saved] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId));
        if (!saved) throw new RollbackResult({ ok: false, code: "NOT_FOUND" });
        if (input.amountPaise !== saved.totalPaise)
          throw new RollbackResult({ ok: false, code: "AMOUNT_MISMATCH" });
        const [existing] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.providerPaymentId, input.providerPaymentId));
        if (existing) return duplicateResult(tx, input);

        // Targeted expiry only: never take another booking's inventory locks before this booking.
        await releaseExpiredHoldsInTx(tx, { bookingId: input.bookingId });
        // A single conditional booking UPDATE arbitrates confirmation versus expiry. An expiry
        // crossed after the lazy sweep is settled here, under the same booking row lock.
        const moved = await tx.execute<{ status: string; checked_at: number }>(sql`
          WITH clock AS MATERIALIZED (SELECT ${confirmationClock()} AS at)
          UPDATE bookings b SET
            status = CASE WHEN b.hold_expires_at > clock.at THEN 'CONFIRMED' ELSE 'EXPIRED' END,
            confirmed_at = CASE WHEN b.hold_expires_at > clock.at THEN clock.at ELSE b.confirmed_at END,
            hold_expires_at = CASE WHEN b.hold_expires_at > clock.at THEN NULL ELSE b.hold_expires_at END
          FROM clock WHERE b.id = ${input.bookingId}::uuid AND b.status = 'HELD'
          RETURNING b.status, (extract(epoch from clock_timestamp()) * 1000)::double precision AS checked_at
        `);
        const transition = moved[0];
        if (
          transition?.status === "CONFIRMED" &&
          (!saved.holdExpiresAt || saved.holdExpiresAt.getTime() <= transition.checked_at)
        ) {
          // PostgreSQL can evaluate the predicate before waiting for a row lock. Roll back a
          // now-stale confirmation and retry, so a lock wait cannot extend a hold's validity.
          throw new HoldElapsedWhileWaiting();
        }
        const confirmed = transition?.status === "CONFIRMED";
        const inserted = await tx
          .insert(payments)
          .values({
            bookingId: input.bookingId,
            provider: input.provider,
            providerPaymentId: input.providerPaymentId,
            amountPaise: saved.totalPaise,
            status: confirmed ? "SUCCESS" : "REFUND_PENDING",
          })
          .onConflictDoNothing({ target: payments.providerPaymentId })
          .returning({ id: payments.id });
        if (!inserted.length) throw new RollbackResult(await duplicateResult(tx, input));

        if (transition) {
          await adjustNights(tx, {
            roomTypeId: saved.roomTypeId,
            dates: eachNight(saved.checkIn, saved.checkOut),
            heldDelta: -saved.units,
            soldDelta: confirmed ? saved.units : 0,
          });
          await tx.insert(bookingEvents).values({
            bookingId: input.bookingId,
            fromStatus: "HELD",
            toStatus: transition.status,
            actor: confirmed ? "system:payment" : "system:expiry",
            note: confirmed ? "Payment received" : "Hold expired before payment confirmation",
          });
          if (confirmed && saved.promoId) await recordPromoUseInTx(tx, saved.promoId);
        }
        const current = (await readBooking(tx, input.bookingId))!;
        if (!confirmed)
          await tx.insert(bookingEvents).values({
            bookingId: input.bookingId,
            fromStatus: current.status,
            toStatus: current.status,
            actor: "system:payment",
            note: "Payment received without a valid hold; refund pending",
          });
        return { ok: true, outcome: confirmed ? "CONFIRMED" : "REFUND_PENDING", booking: current };
      });
    } catch (error) {
      if (error instanceof RollbackResult) return error.result as ConfirmPaymentResult;
      if (error instanceof HoldElapsedWhileWaiting && !retriedElapsed) {
        retriedElapsed = true;
        continue;
      }
      if (isTransactionConflict(error) && !retriedConflict) {
        retriedConflict = true;
        continue;
      }
      throw error;
    }
  }
}
