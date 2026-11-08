"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Plus, Trash2, Users } from "lucide-react";
import { Button, Card, PriceBlock, Select, Stepper } from "@/components/ui";
import { formatStay } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import { cn } from "@/lib/utils";
import { continueState, counter, lineIssues, type CartQuote, type RoomOption } from "../_lib/book";
import {
  bookHref,
  demandByType,
  encodeLine,
  guestsLeft,
  MAX_CART_ROOMS,
  type CartLine,
  type CartStay,
} from "../_lib/cart";
import { guestsLabel, occupancyLabel, plural } from "../_lib/format";
import { nightsByDate } from "../_lib/room-detail";

const keyOf = (lines: CartLine[]) => lines.map(encodeLine).join("|");

/**
 * B6 step 1: the guest edits a room cart (1 to 4 rooms). Every edit replaces the URL; the server
 * component re-renders with the live quote for exactly that cart. The quote is only shown, and
 * Continue only enabled, while it belongs to the cart on screen.
 */
export function CartEditor({
  rooms,
  stay,
  initialLines,
  quote,
  dropped,
  roomsHref,
  groupHref,
}: {
  rooms: RoomOption[];
  stay: CartStay;
  initialLines: CartLine[];
  quote: CartQuote;
  dropped: boolean;
  roomsHref: string;
  groupHref: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [isPending, startTransition] = useTransition();
  const pushed = useRef(keyOf(initialLines));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Back/forward navigation brings a different cart from the URL: adopt it.
  const propsKey = keyOf(initialLines);
  useEffect(() => {
    if (propsKey !== pushed.current) {
      pushed.current = propsKey;
      setLines(initialLines);
    }
  }, [propsKey, initialLines]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function update(next: CartLine[]) {
    setLines(next);
    clearTimeout(timer.current);
    // Short debounce so a run of stepper clicks asks for one quote, not five.
    timer.current = setTimeout(() => {
      pushed.current = keyOf(next);
      const href = bookHref(stay, next);
      startTransition(() => router.replace(href, { scroll: false }));
    }, 250);
  }

  const fresh = keyOf(lines) === propsKey;
  const shownQuote = fresh ? quote : null;
  const issues = lineIssues(rooms, lines, shownQuote);
  const pending = isPending || !fresh;
  const state = continueState({ rooms, lines, party: stay, quote: shownQuote, pending });
  const count = counter(stay, lines);
  const priced = shownQuote?.ok ? shownQuote.quote : null;
  const used = demandByType(lines);
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  function setLine(i: number, patch: Partial<CartLine>) {
    update(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function changeRoom(i: number, roomTypeId: string) {
    const room = roomById.get(roomTypeId);
    if (!room) return;
    const line = lines[i];
    const adults = Math.min(Math.max(line.adults, 1), room.maxAdults);
    setLine(i, {
      roomTypeId,
      ratePlanId: room.plans[0]?.id ?? "",
      adults,
      children: Math.min(line.children, room.maxOccupancy - adults),
    });
  }

  function addRoom() {
    if (lines.length >= MAX_CART_ROOMS) return;
    const room =
      rooms.find((r) => r.plans.length && r.freeUnits > (used.get(r.id) ?? 0)) ?? rooms[0];
    if (!room) return;
    const left = guestsLeft(stay, lines);
    const adults = Math.min(Math.max(left.adults, 1), room.maxAdults);
    const children = Math.min(Math.max(left.children, 0), room.maxOccupancy - adults);
    update([
      ...lines,
      { roomTypeId: room.id, ratePlanId: room.plans[0]?.id ?? "", adults, children },
    ]);
  }

  const detailsHref = bookHref(stay, lines).replace("/book?", "/book/details?");
  const nights = formatStay(stay.checkIn, stay.checkOut);
  const reason = state.ok ? "" : state.reason;

  const continueButton = (className?: string) => (
    <Button
      className={className}
      disabled={!state.ok}
      onClick={() => state.ok && router.push(detailsHref)}
    >
      Continue
    </Button>
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-6">
        <p className="text-body text-muted">
          {nights} ·{" "}
          <Link href={roomsHref} className="font-semibold text-accent hover:underline">
            Change dates
          </Link>
        </p>

        {dropped ? (
          <p className="flex items-start gap-2 text-small text-warning" role="status">
            <CircleAlert className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.5} aria-hidden />
            Some rooms in the link could not be read and were left out. Check your rooms below.
          </p>
        ) : null}

        {lines.length === 0 ? (
          <Card className="flex flex-col items-start gap-3">
            <p className="text-body">No rooms yet. Add a room to start.</p>
          </Card>
        ) : null}

        <ol className="flex flex-col gap-4">
          {lines.map((line, i) => {
            const room = roomById.get(line.roomTypeId);
            const issue = issues[i];
            const priceLine = priced?.lines[i];
            const errorId = `room-${i}-error`;
            return (
              <li key={i}>
                <Card
                  className={cn("flex flex-col gap-5", issue && "border-danger")}
                  aria-describedby={issue ? errorId : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-h2 font-medium">Room {i + 1}</h2>
                      {room ? (
                        <p className="text-small text-muted">{occupancyLabel(room)}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums" aria-live="polite">
                        {priceLine ? formatInr(priceLine.totalPaise) : ""}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-11 px-0"
                        aria-label={`Remove room ${i + 1}`}
                        disabled={lines.length <= 1}
                        onClick={() => update(lines.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-[18px]" strokeWidth={1.5} aria-hidden />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select
                      label="Room"
                      value={room ? line.roomTypeId : ""}
                      onChange={(e) => changeRoom(i, e.target.value)}
                    >
                      {room ? null : (
                        <option value="" disabled>
                          Choose a room
                        </option>
                      )}
                      {rooms.map((r) => {
                        const free = r.freeUnits;
                        const unavailable = free === 0 && r.id !== line.roomTypeId;
                        return (
                          <option key={r.id} value={r.id} disabled={unavailable || !r.plans.length}>
                            {r.name}
                            {free === 0 ? " (not free)" : free <= 3 ? ` (${free} free)` : ""}
                          </option>
                        );
                      })}
                    </Select>
                    <Select
                      label="Plan"
                      value={line.ratePlanId}
                      disabled={!room}
                      help={room?.plans.find((p) => p.id === line.ratePlanId)?.inclusions}
                      onChange={(e) => setLine(i, { ratePlanId: e.target.value })}
                    >
                      {(room?.plans ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.refundable ? "" : " (non-refundable)"}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Stepper
                      label="Adults"
                      hint={room ? `Up to ${room.maxAdults} in this room` : undefined}
                      value={line.adults}
                      min={1}
                      max={room?.maxAdults ?? 1}
                      onChange={(adults) => setLine(i, { adults })}
                    />
                    <Stepper
                      label="Children"
                      hint={room ? `Up to ${plural(room.maxOccupancy, "guest")} in all` : undefined}
                      value={line.children}
                      min={0}
                      max={room ? Math.max(room.maxOccupancy - line.adults, line.children) : 0}
                      onChange={(children) => setLine(i, { children })}
                    />
                  </div>

                  {issue ? (
                    <p
                      id={errorId}
                      role="alert"
                      className="flex items-start gap-2 text-small text-danger"
                    >
                      <CircleAlert
                        className="mt-0.5 size-[18px] shrink-0"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      {issue}
                    </p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col items-start gap-2">
          <Button variant="secondary" onClick={addRoom} disabled={lines.length >= MAX_CART_ROOMS}>
            <Plus className="size-[18px]" strokeWidth={1.5} aria-hidden />
            Add another room
          </Button>
          <p className="text-small text-muted">
            {lines.length >= MAX_CART_ROOMS ? (
              <>
                You can book up to {MAX_CART_ROOMS} rooms online. For a bigger group,{" "}
                <Link href={groupHref} className="font-semibold text-accent hover:underline">
                  send us an enquiry
                </Link>
                .
              </>
            ) : (
              `Up to ${MAX_CART_ROOMS} rooms in one booking. Rooms can be different types.`
            )}
          </p>
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card className="flex flex-col gap-5">
          <div aria-live="polite">
            {count.kind === "placed" ? (
              <p className="flex items-center gap-2 font-display text-h1 font-medium text-success">
                <Check className="size-6 shrink-0" strokeWidth={1.5} aria-hidden />
                Everyone has a room
              </p>
            ) : (
              <p
                className={cn(
                  "font-display text-h1 font-medium",
                  count.kind === "over" && "text-warning",
                )}
              >
                {capitalise(count.text)}
              </p>
            )}
            <p className="mt-1 flex items-center gap-2 text-small text-muted">
              <Users className="size-[18px]" strokeWidth={1.5} aria-hidden />
              Your search: {guestsLabel(stay.adults, stay.children)}
            </p>
          </div>

          <ul className="flex flex-col gap-2 border-t border-border pt-4 text-small">
            {lines.map((line, i) => {
              const room = roomById.get(line.roomTypeId);
              const plan = room?.plans.find((p) => p.id === line.ratePlanId);
              return (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span>
                    <span className="font-semibold">{room?.name ?? `Room ${i + 1}`}</span>
                    <span className="text-muted">
                      {" "}
                      {guestsLabel(line.adults, line.children)}
                      {plan ? `, ${plan.name.toLowerCase()}` : ""}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {priced?.lines[i] ? formatInr(priced.lines[i].totalPaise) : ""}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="min-h-[60px]" aria-live="polite">
            {priced ? (
              <PriceBlock
                totalPaise={priced.totalPaise}
                gstPaise={priced.gstPaise}
                nights={nightsByDate(priced)}
              />
            ) : (
              <p className="text-small text-muted">
                {pending && lines.length
                  ? "Updating the price…"
                  : "The total shows once every room is set."}
              </p>
            )}
          </div>

          {continueButton("w-full")}
          <p className="text-small text-muted" aria-live="polite">
            {state.ok ? "Next, your details. Rooms are held when you confirm them." : reason}
          </p>
        </Card>
      </aside>

      {/* Small screens: the total and Continue stay in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 border-t border-border bg-surface px-4 py-3 lg:hidden">
        <div>
          <p className="font-display text-h2 font-medium tabular-nums">
            {priced ? formatInr(priced.totalPaise) : "—"}
          </p>
          <p className="text-small text-muted">
            {count.kind === "placed" ? plural(lines.length, "room") : capitalise(count.text)}
          </p>
        </div>
        {continueButton()}
      </div>
    </div>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
