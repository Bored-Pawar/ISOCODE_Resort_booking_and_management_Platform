"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";
import { Badge, Button, PriceBlock, Stepper } from "@/components/ui";
import { formatInr } from "@/lib/money";
import { cn } from "@/lib/utils";
import { stayHref, type CartLine, type CartStay, type Party } from "../_lib/cart";
import { guestsLabel, plural } from "../_lib/format";
import {
  availabilityView,
  defaultPlanId,
  formatBp,
  stayNav,
  type PlanView,
} from "../_lib/room-detail";
import { addBlockedReason } from "../_lib/stay";
import { writeStoredStay } from "../_lib/stay-storage";
import { StayNavText } from "./stay-nav-link";
import { useStoredStay } from "./use-stored-stay";

export type PanelRoom = {
  id: string;
  name: string;
  maxAdults: number;
  maxOccupancy: number;
  /** Free website units on every night of the stay. */
  freeUnits: number;
};

/**
 * Room page booking card (view only): the party for THIS room, one-room prices per plan with the
 * GST breakdown, and "Add to my stay", which appends this room to the cart and opens the stay
 * builder. A quiet link goes back to the stay unchanged, or (no cart) to explore more rooms. Prices arrive
 * as props from the server; the room price does not depend on the party.
 */
export function RoomStayPanel({
  room,
  plans,
  stay,
  initialParty,
  urlLines,
  hasCartParam,
  nights,
}: {
  room: PanelRoom;
  plans: PlanView[];
  /** Dates and the whole group from the search. */
  stay: CartStay;
  /** The search party when it fits this room, else the largest party that does. */
  initialParty: Party;
  /** The cart the URL carried (from the stay builder), in order. */
  urlLines: CartLine[];
  hasCartParam: boolean;
  nights: number;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(() => defaultPlanId(plans));
  const [party, setParty] = useState(initialParty);
  const [adding, setAdding] = useState(false);
  // Without a cart in the link, the stay saved in this browser is the cart to add to.
  const saved = useStoredStay();
  const cart = hasCartParam ? urlLines : (saved?.lines ?? []);

  const plan = plans.find((p) => p.id === selectedId) ?? plans[0];
  if (!plan) return null;
  const blocked = addBlockedReason({ id: room.id, freeUnits: room.freeUnits, plans }, cart);
  const multiRate = plan.gst.length > 1;
  const group = stay.adults + stay.children;
  const nav = stayNav({ hasCartParam, stay, lines: urlLines }, saved);
  const status = availabilityView(room.freeUnits);
  const tone = status.state === "low" ? "warning" : "success";

  function add() {
    if (blocked) return;
    const next = [...cart, { roomTypeId: room.id, ratePlanId: plan.id, ...party }];
    setAdding(true);
    writeStoredStay(stay, next);
    router.push(stayHref(stay, next));
  }

  const addButton = (className?: string) => (
    <Button className={className} disabled={!!blocked} loading={adding} onClick={add}>
      Add to my stay
    </Button>
  );

  return (
    <>
      <div className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5">
        <Badge
          tone={tone}
          icon={
            tone === "success" ? <Check strokeWidth={1.5} /> : <TriangleAlert strokeWidth={1.5} />
          }
          className="self-start"
        >
          {status.label}
        </Badge>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-h2 font-medium">Guests in this room</legend>
          <Stepper
            label="Adults"
            hint={`Up to ${room.maxAdults} in this room`}
            value={party.adults}
            min={1}
            max={room.maxAdults}
            onChange={(adults) =>
              setParty((p) => ({
                adults,
                children: Math.min(p.children, room.maxOccupancy - adults),
              }))
            }
          />
          <Stepper
            label="Children"
            hint={`Up to ${plural(room.maxOccupancy, "guest")} in all`}
            value={party.children}
            min={0}
            max={room.maxOccupancy - party.adults}
            onChange={(children) => setParty((p) => ({ ...p, children }))}
          />
          {group > party.adults + party.children ? (
            <p className="text-small text-muted">
              Your group is {guestsLabel(stay.adults, stay.children)}. Place everyone else in more
              rooms on the next page.
            </p>
          ) : null}
        </fieldset>

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
            <caption className="sr-only">Price breakdown for one room, {plan.name}</caption>
            <tbody>
              <tr className="border-t border-border">
                <th scope="row" className="py-1 text-left font-normal text-muted">
                  1 room, {plural(nights, "night")}
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
                    {multiRate ? `, ${plural(g.nights, "night")}` : ""}
                  </th>
                  <td className="py-1 text-right">{formatInr(g.paise)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <th scope="row" className="py-1 text-left font-semibold">
                  Total for this room
                </th>
                <td className="py-1 text-right">{formatInr(plan.totalPaise)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {addButton("w-full")}
        {blocked ? <p className="text-small text-muted">{blocked}.</p> : null}
        <p className="text-small text-muted">
          {nav.kind === "back"
            ? "Adding puts this room in your stay and takes you back to it. You will not be charged yet."
            : "Adding starts your stay. You can add more rooms on the next page. You will not be charged yet."}
        </p>
        <StayNavText nav={nav} className="-my-2 self-center" />
      </div>

      {/* Small screens: the price, Add to my stay and the quiet link stay in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 border-t border-border bg-surface px-4 py-2 lg:hidden">
        <div className="min-w-0">
          <p className="truncate">
            <span className="font-display text-h2 font-medium tabular-nums">
              {formatInr(plan.totalPaise)}
            </span>{" "}
            <span className="text-small text-muted">1 room, {plural(nights, "night")}</span>
          </p>
          <StayNavText nav={nav} className="min-h-9" />
        </div>
        {addButton("shrink-0")}
      </div>
    </>
  );
}
