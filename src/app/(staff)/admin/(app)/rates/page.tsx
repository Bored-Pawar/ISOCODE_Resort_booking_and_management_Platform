import { Suspense } from "react";
import { TableSkeleton } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { catalog } from "@/modules/catalog";
import { admin, adminWindow, clampGridStart, GRID_DAYS } from "@/modules/admin";
import { RetryError } from "@/app/(guest)/_components/retry-error";
import { Forbidden } from "../_components/forbidden";
import { staffPage } from "../_lib/access";
import { RatesBoard } from "./rates-board";
import { safeError } from "@/lib/log";

export const metadata = { title: "Rates" };

type Params = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Content({ searchParams }: { searchParams: Params }) {
  const access = await staffPage("rates.edit");
  if ("forbidden" in access) return <Forbidden />;
  const sp = await searchParams;
  const start = clampGridStart(one(sp.start));
  const end = addDays(start, GRID_DAYS - 1);
  const room = one(sp.room) ?? "all";
  let rates;
  let types;
  try {
    [rates, types] = await Promise.all([
      admin.readRates({ from: start, to: end }, access.actor),
      catalog.listRoomTypes(),
    ]);
  } catch (error) {
    console.error("rates read failed", safeError(error));
    return <RetryError title="We could not load rates" message="Please try again." />;
  }
  if (!rates.ok) return <Forbidden />;
  const window = adminWindow();
  return (
    <>
      <h1 className="text-h1">Rates</h1>
      <p className="mt-1 max-w-[640px] text-small text-muted">
        Nightly price per room and plan, before GST. Existing bookings keep the price they were
        booked at. A guest with these dates already in their cart sees “price updated” before
        paying.
      </p>
      <RatesBoard
        start={start}
        window={window}
        room={room}
        rooms={types.map((t) => ({
          id: t.id,
          name: t.name,
          plans: t.ratePlans.map((p) => p.code),
        }))}
        rows={rates.rows}
      />
    </>
  );
}

export default function RatesPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<TableSkeleton rows={8} cols={8} />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
