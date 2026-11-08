import { and, asc, desc, eq, getTableColumns, gte, inArray, lte, type SQL } from "drizzle-orm";
import { bookingEvents, bookingNights, bookingRooms, bookings, payments } from "@/db/schema";
import type { Tx } from "@/lib/db";
import { getDb } from "@/lib/db";
import { promoCodesInTx } from "@/modules/pricing/internal";
import type {
  Booking,
  BookingStatus,
  GetForStaffResult,
  ListForStaffResult,
  ListRefundPendingResult,
  ParsedListForStaffInput,
  StaffPayment,
} from "./index";

/**
 * Batched snapshot read: at most three more data queries (rooms, nights, promo codes) for any
 * number of bookings, assembled in TS in the order of `rows`. With `guestId`, every query also
 * carries the owner predicate (guest reads); staff reads pass none.
 */
export async function readBookings(
  tx: Tx,
  rows: (typeof bookings.$inferSelect)[],
  opts: { guestId?: string } = {},
): Promise<Booking[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const owner = opts.guestId ? eq(bookings.guestId, opts.guestId) : undefined;
  const rooms = await tx
    .select(getTableColumns(bookingRooms))
    .from(bookingRooms)
    .innerJoin(bookings, eq(bookings.id, bookingRooms.bookingId))
    .where(and(inArray(bookingRooms.bookingId, ids), owner))
    .orderBy(asc(bookingRooms.lineNo));
  const nights = rooms.length
    ? await tx
        .select(getTableColumns(bookingNights))
        .from(bookingNights)
        .innerJoin(bookingRooms, eq(bookingRooms.id, bookingNights.bookingRoomId))
        .innerJoin(bookings, eq(bookings.id, bookingRooms.bookingId))
        .where(
          and(
            inArray(
              bookingNights.bookingRoomId,
              rooms.map((r) => r.id),
            ),
            owner,
          ),
        )
        .orderBy(asc(bookingNights.date))
    : [];
  const promos = await promoCodesInTx(tx, [
    ...new Set(rows.map((r) => r.promoId).filter((id): id is string => !!id)),
  ]);
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

/** One booking for staff with its audit timeline (oldest first) and payments. */
export async function getForStaff(ref: string): Promise<GetForStaffResult> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(bookings).where(eq(bookings.ref, ref));
    if (!row) return { ok: false, code: "NOT_FOUND" } as const;
    const [b] = await readBookings(tx, [row]);
    const events = await tx
      .select()
      .from(bookingEvents)
      .where(eq(bookingEvents.bookingId, row.id))
      .orderBy(asc(bookingEvents.at));
    const paid = await tx
      .select()
      .from(payments)
      .where(eq(payments.bookingId, row.id))
      .orderBy(asc(payments.createdAt));
    return {
      ok: true,
      booking: b,
      events: events.map((e) => ({
        at: e.at.toISOString(),
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        actor: e.actor,
        note: e.note,
      })),
      payments: paid.map(toStaffPayment(row.ref)),
    } as const;
  });
}

/** Payments recorded for refund (late payment after a hold ended), newest first. */
export async function listRefundPending(limit: number): Promise<ListRefundPendingResult> {
  const rows = await getDb()
    .select({ p: payments, ref: bookings.ref })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .where(eq(payments.status, "REFUND_PENDING"))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
  return { ok: true, payments: rows.map((r) => toStaffPayment(r.ref)(r.p)) };
}

function toStaffPayment(ref: string) {
  return (p: typeof payments.$inferSelect): StaffPayment => ({
    id: p.id,
    bookingId: p.bookingId,
    ref,
    provider: p.provider,
    providerPaymentId: p.providerPaymentId,
    amountPaise: p.amountPaise,
    status: p.status as StaffPayment["status"],
    createdAt: p.createdAt.toISOString(),
  });
}
