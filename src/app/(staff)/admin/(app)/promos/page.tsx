import { Suspense } from "react";
import { TableSkeleton } from "@/components/ui";
import { todayIST } from "@/lib/dates";
import { admin } from "@/modules/admin";
import { RetryError } from "@/app/(guest)/_components/retry-error";
import { Forbidden } from "../_components/forbidden";
import { staffPage } from "../_lib/access";
import { PromosBoard } from "./promos-board";

export const metadata = { title: "Promo codes" };

async function Content() {
  const access = await staffPage("promos.manage");
  if ("forbidden" in access) return <Forbidden />;
  let res;
  try {
    res = await admin.listPromos(access.actor);
  } catch (error) {
    console.error("promo list failed", error);
    return <RetryError title="We could not load promo codes" message="Please try again." />;
  }
  if (!res.ok) return <Forbidden />;
  return (
    <>
      <h1 className="text-h1">Promo codes</h1>
      <p className="mt-1 max-w-[640px] text-small text-muted">
        One code per booking. Valid from and to are stay dates: the first and the last night of the
        stay must both fall inside them. Switching a code off stops new bookings using it; confirmed
        bookings keep their discount.
      </p>
      <PromosBoard promos={res.promos} today={todayIST()} />
    </>
  );
}

export default function PromosPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={5} cols={7} />}>
      <Content />
    </Suspense>
  );
}
