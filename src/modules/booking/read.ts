import { eq, asc, inArray } from "drizzle-orm";
import { bookings, bookingNights, bookingRooms } from "@/db/schema";
import type { Tx } from "@/lib/db";
import { promoCodeInTx } from "@/modules/pricing/internal";
import type { Booking, BookingStatus } from "./index";

export async function readBooking(tx: Tx, id: string): Promise<Booking | null> {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, id));
  if (!b) return null;
  const rooms = await tx
    .select()
    .from(bookingRooms)
    .where(eq(bookingRooms.bookingId, b.id))
    .orderBy(asc(bookingRooms.lineNo));
  const nights = rooms.length
    ? await tx
        .select()
        .from(bookingNights)
        .where(
          inArray(
            bookingNights.bookingRoomId,
            rooms.map((r) => r.id),
          ),
        )
        .orderBy(asc(bookingNights.date))
    : [];
  return {
    id: b.id,
    ref: b.ref,
    guestId: b.guestId,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status as BookingStatus,
    holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
    quoteHash: b.quoteHash,
    promoCode: b.promoId ? await promoCodeInTx(tx, b.promoId) : null,
    subtotalPaise: b.subtotalPaise,
    discountPaise: b.discountPaise,
    gstPaise: b.gstPaise,
    totalPaise: b.totalPaise,
    rooms: rooms.map((r) => ({
      lineNo: r.lineNo,
      roomTypeId: r.roomTypeId,
      ratePlanId: r.ratePlanId,
      adults: r.adults,
      children: r.children,
      subtotalPaise: r.subtotalPaise,
      discountPaise: r.discountPaise,
      gstPaise: r.gstPaise,
      totalPaise: r.totalPaise,
      nights: nights
        .filter((n) => n.bookingRoomId === r.id)
        .map((n) => ({
          date: n.date,
          ratePaise: n.ratePaise,
          discountPaise: n.discountPaise,
          gstBp: n.gstBp,
          gstPaise: n.gstPaise,
        })),
    })),
    createdAt: b.createdAt.toISOString(),
    confirmedAt: b.confirmedAt?.toISOString() ?? null,
  };
}
