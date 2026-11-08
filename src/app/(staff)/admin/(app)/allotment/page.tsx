import { Suspense } from "react";
import { TableSkeleton } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { can } from "@/lib/auth/permissions";
import { admin, adminWindow, clampGridStart, GRID_DAYS } from "@/modules/admin";
import { RetryError } from "@/app/(guest)/_components/retry-error";
import { Forbidden } from "../_components/forbidden";
import { staffPage } from "../_lib/access";
import { AllotmentBoard } from "./allotment-board";

export const metadata = { title: "Allotment" };

type Params = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Content({ searchParams }: { searchParams: Params }) {
  const access = await staffPage("allotment.edit");
  if ("forbidden" in access) return <Forbidden />;
  const sp = await searchParams;
  const start = clampGridStart(one(sp.start));
  const end = addDays(start, GRID_DAYS - 1);
  let data;
  try {
    data = await admin.readAllotment({ from: start, to: end }, access.actor);
  } catch (error) {
    console.error("allotment read failed", error);
    return <RetryError title="We could not load allotment" message="Please try again." />;
  }
  if (!data.ok) return <Forbidden />;
  return (
    <>
      <h1 className="text-h1">Allotment</h1>
      <p className="mt-1 max-w-[640px] text-small text-muted">
        Rooms the website may sell each night. Check availability outside the website before raising
        allotment. A cut below what is already sold or held is refused for that date only.
      </p>
      <AllotmentBoard
        start={start}
        window={adminWindow()}
        room={one(sp.room) ?? "all"}
        rows={data.rows}
        blackouts={data.blackouts}
        canToggle={can(access.user.role, "availability.toggle")}
      />
    </>
  );
}

export default function AllotmentPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<TableSkeleton rows={5} cols={8} />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
