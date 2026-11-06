import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { StaffShell } from "@/components/layout/staff-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser, STAFF_ROLES } from "@/lib/auth";
import { signOutAction } from "@/lib/auth/actions";

// Extend as admin screens land (rates, allotment, inbox...). Only real routes belong here.
const nav = [{ href: "/admin", label: "Overview", icon: <LayoutDashboard strokeWidth={1.5} /> }];

async function Gate({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || !(STAFF_ROLES as readonly string[]).includes(user.role)) redirect("/admin/login");
  return (
    <StaffShell
      nav={nav}
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
