import { and, asc, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { bookingNights, bookingRooms, bookings } from "@/db/schema";
import type { Tx } from "@/lib/db";
import { getDb } from "@/lib/db";
import { promoCodeInTx } from "@/modules/pricing/internal";
import type { Booking, BookingStatus, ListForStaffResult, ParsedListForStaffInput } from "./index";

/** Batched snapshot read: four queries for any number of bookings, in the order of `rows`. */
export async function readBookings(
  tx: Tx,
  rows: (typeof bookings.$inferSelect)[],
): Promise<Booking[]> {
  if (!rows.length) return [];
  const rooms = await tx
    .select()
    .from(bookingRooms)
    .where(
      inArray(
        bookingRooms.bookingId,
        rows.map((r) => r.id),
      ),
    )
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
  const promoIds = [...new Set(rows.map((r) => r.promoId).filter((id): id is string => !!id))];
  const promos = new Map<string, string | null>();
  for (const id of promoIds) promos.set(id, await promoCodeInTx(tx, id));
  return rows.map((b) => ({
    id: b.id,
    ref: b.ref,
    guestId: b.guestId,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status as BookingStatus,
    holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null,
    quoteHash: b.quoteHash,
    promoCode: b.promoId ? (promos.get(b.promoId) ?? null) : null,
    subtotalPaise: b.subtotalPaise,
    discountPaise: b.discountPaise,
    gstPaise: b.gstPaise,
    totalPaise: b.totalPaise,
    rooms: rooms
      .filter((r) => r.bookingId === b.id)
      .map((r) => ({
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
  }));
}

/** Staff list (A5). Read only: no lazy expiry, so a lapsed HELD row shows as HELD until swept. */
export async function listForStaff(input: ParsedListForStaffInput): Promise<ListForStaffResult> {
  const where: SQL[] = [];
  if (input.status) where.push(eq(bookings.status, input.status));
  if (input.checkInFrom) where.push(gte(bookings.checkIn, input.checkInFrom));
  if (input.checkInTo) where.push(lte(bookings.checkIn, input.checkInTo));
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(bookings)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(bookings.createdAt))
      .limit(input.limit);
    return { ok: true, bookings: await readBookings(tx, rows) } as const;
  });
}
