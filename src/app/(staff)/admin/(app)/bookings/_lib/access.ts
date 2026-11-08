import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { BOOKING_STAFF_ROLES, type BookingActor } from "@/modules/booking";

/**
 * A5 pages: reservations or gm. Sales has no booking authority in the current scope, so it gets a
 * 404 (the nav item is hidden for sales too). The booking service checks the role again.
 */
export async function requireBookingStaff(): Promise<{ user: SessionUser; actor: BookingActor }> {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!(BOOKING_STAFF_ROLES as readonly string[]).includes(user.role)) notFound();
  return { user, actor: { userId: user.id, role: user.role } };
}
