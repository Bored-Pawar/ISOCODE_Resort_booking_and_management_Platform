import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  BadgePercent,
  BedDouble,
  CalendarRange,
  Inbox,
  IndianRupee,
  LayoutDashboard,
} from "lucide-react";
import { StaffShell } from "@/components/layout/staff-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser, STAFF_ROLES } from "@/lib/auth";
import { can, navFor, type NavIcon } from "@/lib/auth/permissions";
import { signOutAction } from "@/lib/auth/actions";
import { GmBellLoader } from "./inbox/_components/gm-bell-loader";

const ICONS: Record<NavIcon, React.ReactNode> = {
  overview: <LayoutDashboard strokeWidth={1.5} />,
  inbox: <Inbox strokeWidth={1.5} />,
  bookings: <CalendarRange strokeWidth={1.5} />,
  rates: <IndianRupee strokeWidth={1.5} />,
  allotment: <BedDouble strokeWidth={1.5} />,
  promos: <BadgePercent strokeWidth={1.5} />,
};

const ROLE_NAMES = { reservations: "Reservations", sales: "Sales", gm: "General manager" } as const;

/**
 * Staff frame. Navigation comes from `navFor(role)`: a role only sees screens it may use. This is
 * presentation only; every page and action checks its own permission on the server.
 */
async function Gate({ children }: { children: React.ReactNode }) {
  // Auth.js uses crypto.getRandomValues() inside auth(); render at request time first.
  await connection();
  const user = await getSessionUser();
  if (!user || !(STAFF_ROLES as readonly string[]).includes(user.role)) redirect("/admin/login");
  const role = user.role as keyof typeof ROLE_NAMES;
  return (
    <StaffShell
      nav={navFor(role).map((n) => ({ href: n.href, label: n.label, icon: ICONS[n.icon] }))}
      bell={
        can(role, "notifications.gm") ? (
          <Suspense fallback={<Skeleton className="size-11" />}>
            <GmBellLoader />
          </Suspense>
        ) : undefined
      }
      account={
        <div className="flex flex-col gap-2">
          <div className="text-small font-semibold">{user.name}</div>
          <Badge tone="accent" className="w-fit">
            {ROLE_NAMES[role]}
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
