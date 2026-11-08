import { accessErrorResponse, requireRole } from "@/lib/auth";
import { booking } from "@/modules/booking";
import { catalog } from "@/modules/catalog";
import { confirmationIcs } from "../../../../_lib/confirmation";
import { bookingRefSchema } from "../../../../_lib/own-booking";

/** "Add to calendar" (B8): an all-day event for the guest's own confirmed booking. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  const parsed = bookingRefSchema.safeParse((await params).ref);
  let guest;
  try {
    guest = await requireRole("guest");
  } catch (error) {
    const denied = accessErrorResponse(error);
    if (denied) return denied;
    throw error;
  }
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const got = await booking.get({ ref: parsed.data }, { userId: guest.id, role: "guest" });
  // Someone else's ref looks exactly like a missing one; only a confirmed stay goes in a calendar.
  if (!got.ok || got.booking.status !== "CONFIRMED")
    return new Response("Not found", { status: 404 });
  const ics = confirmationIcs(got.booking, await catalog.listRoomTypes(), new Date());
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${got.booking.ref}.ics"`,
      "cache-control": "private, no-store",
    },
  });
}
