import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { booking, type Booking } from "@/modules/booking";

export const bookingRefSchema = z.string().regex(/^CA-[0-9A-Z]{5}$/);

/**
 * The signed-in guest's own booking for a guest page. Signed out: login, then back here. Anyone
 * else's ref, or a malformed one, is a 404 (a ref in a URL is never authorisation).
 */
export async function loadOwnBooking(
  ref: string,
  back: string,
): Promise<{ user: SessionUser; booking: Booking }> {
  await connection();
  const user = await getSessionUser();
  if (!user || user.role !== "guest") redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!bookingRefSchema.safeParse(ref).success) notFound();
  const got = await booking.get({ ref }, { userId: user.id, role: "guest" });
  if (!got.ok) notFound();
  return { user, booking: got.booking };
}
