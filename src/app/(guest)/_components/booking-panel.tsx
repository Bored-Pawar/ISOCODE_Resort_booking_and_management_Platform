"use client";

import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Badge, ButtonLink, PriceBlock } from "@/components/ui";
import { formatInr } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  bookHref,
  defaultPlanId,
  formatBp,
  type BookBase,
  type PlanView,
} from "../_lib/room-detail";

/**
 * Rate plan choice, price with GST breakdown and the Reserve link. All prices arrive as props
 * (quoted on the server); the only state is which plan is selected. On small screens a fixed bar
 * repeats the selected total and Reserve so the action is always in reach.
 */
export function BookingPanel({
  plans,
  base,
  nights,
  availability,
}: {
  plans: PlanView[];
  base: BookBase;
  nights: number;
  availability: { tone: "success" | "warning"; text: string };
}) {
  const [selectedId, setSelectedId] = useState(() => defaultPlanId(plans));
  const plan = plans.find((p) => p.id === selectedId) ?? plans[0];
  if (!plan) return null;
  const href = bookHref(base, plan);
  const multiRate = plan.gst.length > 1;

  return (
    <>
      <div className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5">
        <Badge
          tone={availability.tone}
          icon={
            availability.tone === "success" ? (
              <Check strokeWidth={1.5} />
            ) : (
              <TriangleAlert strokeWidth={1.5} />
            )
          }
          className="self-start"
        >
          {availability.text}
        </Badge>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-h2 font-medium">Choose a plan</legend>
          {plans.map((p) => {
            const selected = p.id === plan.id;
            return (
              <label
                key={p.id}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-card border p-4 transition-colors duration-150 ease-out has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                  selected ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2",
                )}
              >
                <input
                  type="radio"
                  name="ratePlan"
                  value={p.id}
                  checked={selected}
                  onChange={() => setSelectedId(p.id)}
                  className="mt-1 size-4 accent-accent"
                />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{p.name}</span>
                    <span className="font-semibold tabular-nums">{formatInr(p.totalPaise)}</span>
                  </span>
                  <span className="text-small text-muted">{p.inclusions}</span>
                  <span className="text-small text-muted">
                    {p.refundable ? "Refundable" : "Non-refundable"}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="flex flex-col gap-3" aria-live="polite">
          <PriceBlock totalPaise={plan.totalPaise} gstPaise={plan.gstPaise} nights={plan.nights} />
          <table className="w-full text-small tabular-nums">
            <caption className="sr-only">Price breakdown for {plan.name}</caption>
            <tbody>
              <tr className="border-t border-border">
                <th scope="row" className="py-1 text-left font-normal text-muted">
                  Room · {nights} night{nights === 1 ? "" : "s"}
                </th>
                <td className="py-1 text-right">{formatInr(plan.subtotalPaise)}</td>
              </tr>
              {plan.discountPaise > 0 ? (
                <tr className="border-t border-border">
                  <th scope="row" className="py-1 text-left font-normal text-muted">
                    Discount
                  </th>
                  <td className="py-1 text-right">−{formatInr(plan.discountPaise)}</td>
                </tr>
              ) : null}
              {plan.gst.map((g) => (
                <tr key={g.bp} className="border-t border-border">
                  <th scope="row" className="py-1 text-left font-normal text-muted">
                    GST {formatBp(g.bp)}
                    {multiRate ? ` · ${g.nights} night${g.nights === 1 ? "" : "s"}` : ""}
                  </th>
                  <td className="py-1 text-right">{formatInr(g.paise)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <th scope="row" className="py-1 text-left font-semibold">
                  Total
                </th>
                <td className="py-1 text-right">{formatInr(plan.totalPaise)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <ButtonLink href={href} className="w-full">
          Reserve
        </ButtonLink>
        <p className="text-small text-muted">You will not be charged yet.</p>
      </div>

      {/* Small screens: the selected total and Reserve stay in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 border-t border-border bg-surface px-4 py-3 lg:hidden">
        <div>
          <p className="font-display text-h2 font-medium tabular-nums">
            {formatInr(plan.totalPaise)}
          </p>
          <p className="text-small text-muted">
            {nights} night{nights === 1 ? "" : "s"} · {plan.name}
          </p>
        </div>
        <ButtonLink href={href}>Reserve</ButtonLink>
      </div>
    </>
  );
}
