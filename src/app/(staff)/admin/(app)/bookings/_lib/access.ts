import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { AccessError, type SessionUser } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/permissions";
import type { BookingActor } from "@/modules/booking";

/**
 * A5 pages: `bookings.view` (reservations, gm). Sales has no booking authority, so it gets a 404
 * (the nav item is hidden for sales too). The booking service checks the role again.
 */
export async function requireBookingStaff(): Promise<{ user: SessionUser; actor: BookingActor }> {
  await connection();
  let user: SessionUser;
  try {
    user = await requirePermission("bookings.view");
  } catch (err) {
    if (err instanceof AccessError) {
      if (err.code === "UNAUTHENTICATED") redirect("/admin/login");
      notFound();
    }
    throw err;
  }
  return { user, actor: { userId: user.id, role: user.role } };
}
