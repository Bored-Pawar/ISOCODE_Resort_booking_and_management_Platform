import { eq, asc } from "drizzle-orm";
import { bookings, bookingNights } from "@/db/schema";
import type { Tx } from "@/lib/db";
import { promoCodeInTx } from "@/modules/pricing/internal";
import type { Booking, BookingStatus } from "./index";

export async function readBooking(tx: Tx, id: string): Promise<Booking | null> {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, id));
  if (!b) return null;
  const nights = await tx
    .select({
      date: bookingNights.date,
      ratePaise: bookingNights.ratePaise,
      discountPaise: bookingNights.discountPaise,
      gstBp: bookingNights.gstBp,
      gstPaise: bookingNights.gstPaise,
    })
    .from(bookingNights)
    .where(eq(bookingNights.bookingId, id))
    .orderBy(asc(bookingNights.date));
  return {
    id: b.id,
    ref: b.ref,
    guestId: b.guestId,
    roomTypeId: b.roomTypeId,
    ratePlanId: b.ratePlanId,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    units: b.units,
    adults: b.adults,
    children: b.children,
    status: b.status as BookingStatus,
    holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
    quoteHash: b.quoteHash,
    promoCode: b.promoId ? await promoCodeInTx(tx, b.promoId) : null,
    subtotalPaise: b.subtotalPaise,
    discountPaise: b.discountPaise,
    gstPaise: b.gstPaise,
    totalPaise: b.totalPaise,
    nights,
    createdAt: b.createdAt.toISOString(),
    confirmedAt: b.confirmedAt?.toISOString() ?? null,
  };
}
