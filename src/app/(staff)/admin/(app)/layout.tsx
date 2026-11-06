import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, STAFF_ROLES } from "@/lib/auth";

async function Gate({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || !(STAFF_ROLES as readonly string[]).includes(user.role)) redirect("/admin/login");
  return <>{children}</>;
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
