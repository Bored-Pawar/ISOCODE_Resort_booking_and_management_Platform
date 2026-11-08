import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CalendarRange, LayoutDashboard, Inbox } from "lucide-react";
import { BOOKING_STAFF_ROLES } from "@/modules/booking";
import { StaffShell } from "@/components/layout/staff-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser, STAFF_ROLES } from "@/lib/auth";
import { signOutAction } from "@/lib/auth/actions";

// Extend as admin screens land (rates, allotment, inbox...). Only real routes belong here.
const nav = [
  { href: "/admin", label: "Overview", icon: <LayoutDashboard strokeWidth={1.5} /> },
  { href: "/admin/inbox", label: "Unsorted enquiries", icon: <Inbox strokeWidth={1.5} /> },
];
// A5: only roles with booking authority see Bookings (sales has none in the current scope).
const bookingsNav = {
  href: "/admin/bookings",
  label: "Bookings",
  icon: <CalendarRange strokeWidth={1.5} />,
};

async function Gate({ children }: { children: React.ReactNode }) {
  // Auth.js uses crypto.getRandomValues() inside auth(); render at request time first.
  await connection();
  const user = await getSessionUser();
  if (!user || !(STAFF_ROLES as readonly string[]).includes(user.role)) redirect("/admin/login");
  return (
    <StaffShell
      nav={
        (BOOKING_STAFF_ROLES as readonly string[]).includes(user.role) ? [...nav, bookingsNav] : nav
      }
      account={
        <div className="flex flex-col gap-2">
          <div className="text-small font-semibold">{user.name}</div>
          <Badge tone="accent" className="w-fit">
            {user.role}
          </Badge>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm" className="-ml-3">
              Sign out
            </Button>
          </form>
        </div>
      }
    >
      {children}
    </StaffShell>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="m-8 h-9 w-64" />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
