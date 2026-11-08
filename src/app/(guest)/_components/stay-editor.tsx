"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CircleSlash, Plus, Trash2, Users } from "lucide-react";
import { Badge, Button, ButtonLink, Card, PriceBlock, Select, Stepper } from "@/components/ui";
import { fitsRoom } from "@/lib/occupancy";
import { formatInr } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  continueState,
  counter,
  lineIssues,
  type CartQuote,
  type RoomCardView,
} from "../_lib/book";
import {
  detailsHref,
  encodeLine,
  guestsLeft,
  MAX_CART_ROOMS,
  stayHref,
  stayQuery,
  type CartLine,
  type CartStay,
  type Party,
} from "../_lib/cart";
import { guestsLabel, occupancyLabel, plural } from "../_lib/format";
import { nightsByDate } from "../_lib/room-detail";
import { SEARCH_LIMITS } from "../_lib/search";
import { addBlockedReason, partyForRoom, roomsLeftToAdd } from "../_lib/stay";
import { readStoredStay, writeStoredStay } from "../_lib/stay-storage";

const keyOf = (group: Party, lines: CartLine[]) =>
  [group.adults, group.children, ...lines.map(encodeLine)].join("|");

/**
 * The stay builder: room type cards, the guest's room lines ("Your stay") and a summary with the
 * still-to-place counter. Every edit replaces the URL; the server re-renders with the live quote
 * for exactly that cart. Prices are shown (and Continue enabled) only while they belong to the
 * cart on screen. The cart is mirrored to this browser's storage and restored when /rooms opens
 * without one.
 */
export function StayEditor({
  rooms,
  stay,
  initialLines,
  hasCartParam,
  quote,
  dropped,
  nights,
  suggested,
  groupTooBig,
  groupHref,
}: {
  rooms: RoomCardView[];
  /** Dates and group from the URL. */
  stay: CartStay;
  initialLines: CartLine[];
  /** The URL carried a cart (possibly empty after edits); false means "restore if saved". */
  hasCartParam: boolean;
  quote: CartQuote;
  dropped: boolean;
  nights: number;
  /** A starting cart for the URL's group, or null when none fits in 4 rooms with free stock. */
  suggested: CartLine[] | null;
  groupTooBig: boolean;
  groupHref: string;
}) {
  const router = useRouter();
  const urlGroup = { adults: stay.adults, children: stay.children };
  const [lines, setLines] = useState(initialLines);
  const [group, setGroup] = useState<Party>(urlGroup);
  const [isPending, startTransition] = useTransition();
  const propsKey = keyOf(urlGroup, initialLines);
  const pushed = useRef(propsKey);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const started = useRef(false);

  function update(nextLines: CartLine[], nextGroup: Party = group) {
    setLines(nextLines);
    setGroup(nextGroup);
    const nextStay = { checkIn: stay.checkIn, checkOut: stay.checkOut, ...nextGroup };
    writeStoredStay(nextStay, nextLines);
    clearTimeout(timer.current);
    // Short debounce so a run of stepper clicks asks for one quote, not five.
    timer.current = setTimeout(() => {
      pushed.current = keyOf(nextGroup, nextLines);
      const href = stayHref(nextStay, nextLines);
      startTransition(() => router.replace(href, { scroll: false }));
    }, 250);
  }

  // First load: restore a saved stay when the URL has no cart, else save what the URL has.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!hasCartParam && initialLines.length === 0) {
      const saved = readStoredStay();
      if (saved && saved.lines.length) {
        // Back into the URL; the adoption effect below picks the lines up from the new props.
        router.replace(stayHref(stay, saved.lines), { scroll: false });
        return;
      }
    }
    writeStoredStay(stay, initialLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // Back/forward navigation brings a different cart from the URL: adopt it.
  useEffect(() => {
    if (propsKey !== pushed.current) {
      pushed.current = propsKey;
      setLines(initialLines);
      setGroup({ adults: stay.adults, children: stay.children });
    }
  }, [propsKey, initialLines, stay.adults, stay.children]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const fresh = keyOf(group, lines) === propsKey;
  const shownQuote = fresh ? quote : null;
  const issues = lineIssues(rooms, lines, shownQuote);
  const pending = isPending || !fresh;
  const state = continueState({ rooms, lines, party: group, quote: shownQuote, pending });
  const count = counter(group, lines);
  const left = guestsLeft(group, lines);
  const toPlace = Math.max(left.adults, 0) + Math.max(left.children, 0);
  const placed = lines.reduce((s, l) => s + l.adults + l.children, 0);
  const total = group.adults + group.children;
  const priced = shownQuote?.ok ? shownQuote.quote : null;
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const currentStay = { checkIn: stay.checkIn, checkOut: stay.checkOut, ...group };
  const detailQuery = stayQuery(currentStay, lines).toString();
  const atMax = lines.length >= MAX_CART_ROOMS;
  // Not enough stock or rooms for the group: offer a prefilled enquiry.
  const needsEnquiry = groupTooBig || (fresh && suggested === null);

  function setLine(i: number, patch: Partial<CartLine>) {
    update(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function newLine(room: RoomCardView): CartLine {
    const rest = guestsLeft(group, lines);
    const party =
      rest.adults >= 1
        ? partyForRoom(room, { adults: rest.adults, children: Math.max(rest.children, 0) })
        : { adults: 1, children: 0 };
    return { roomTypeId: room.id, ratePlanId: room.defaultPlanId ?? room.plans[0].id, ...party };
  }

  function addRoom(room: RoomCardView) {
    if (addBlockedReason(room, lines)) return;
    update([...lines, newLine(room)]);
  }

  /** "+ Add a room": the smallest free type that takes everyone left, else the largest free one. */
  function addNext() {
    const open = rooms.filter((r) => !addBlockedReason(r, lines));
    if (!open.length) return;
    const rest = { adults: Math.max(left.adults, 1), children: Math.max(left.children, 0) };
    const bySize = [...open].sort((a, b) => a.maxOccupancy - b.maxOccupancy);
    addRoom(bySize.find((r) => fitsRoom(r, rest)) ?? bySize[bySize.length - 1]);
  }
  const canAddNext = rooms.some((r) => !addBlockedReason(r, lines));

  function changeRoom(i: number, roomTypeId: string) {
    const room = roomById.get(roomTypeId);
    if (!room) return;
    const line = lines[i];
    const adults = Math.min(Math.max(line.adults, 1), room.maxAdults);
    setLine(i, {
      roomTypeId,
      ratePlanId: room.defaultPlanId ?? room.plans[0]?.id ?? "",
      adults,
      children: Math.min(line.children, room.maxOccupancy - adults),
    });
  }

  const goNext = () => {
    if (state.ok && priced) router.push(detailsHref(currentStay, lines, priced.quoteHash));
  };

  const counterText =
    count.kind === "placed"
      ? "Everyone has a room"
      : count.kind === "over"
        ? capitalise(count.text)
        : `${toPlace} still to place`;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-12">
        {/* ---- Rooms and packages -------------------------------------------- */}
        <section aria-labelledby="rooms-heading" className="flex flex-col gap-4">
          <div>
            <h2 id="rooms-heading" className="font-display text-h1 font-medium">
              Rooms and packages
            </h2>
            <p className="mt-1 text-small text-muted">
              Prices are for one room for {plural(nights, "night")}, including GST. Each room has
              its own plan: room only, with breakfast, or with breakfast and dinner.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {rooms.map((room, i) => {
              const blocked = addBlockedReason(room, lines);
              const soldOut = room.freeUnits === 0 || !room.plans.length;
              const inStay = lines.filter((l) => l.roomTypeId === room.id).length;
              const leftToAdd = roomsLeftToAdd(room, lines);
              return (
                <li key={room.id}>
                  <article
                    className={cn(
                      "flex h-full flex-col overflow-hidden rounded-card border border-border",
                      soldOut ? "bg-surface-2" : "bg-surface",
                    )}
                  >
                    <Link
                      href={`/rooms/${room.slug}?${detailQuery}`}
                      tabIndex={-1}
                      aria-hidden
                      className="block bg-surface-2"
                    >
                      {room.photo ? (
                        <Image
                          src={room.photo.url}
                          alt=""
                          width={room.photo.width}
                          height={room.photo.height}
                          sizes="(min-width: 1120px) 360px, (min-width: 640px) 45vw, 92vw"
                          priority={i === 0}
                          loading={i === 0 ? undefined : "lazy"}
                          className={cn(
                            "aspect-[4/3] w-full object-cover",
                            soldOut && "opacity-60 grayscale",
                          )}
                        />
                      ) : (
                        <div className="aspect-[4/3]" />
                      )}
                    </Link>
                    <div className="flex flex-1 flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3
                          className={cn(
                            "font-display text-h2 font-medium",
                            soldOut && "text-muted",
                          )}
                        >
                          {room.name}
                        </h3>
                        {soldOut ? (
                          <Badge tone="danger" icon={<CircleSlash strokeWidth={1.5} />}>
                            Sold out
                          </Badge>
                        ) : (
                          <Badge tone={room.freeUnits <= 3 ? "warning" : "neutral"}>
                            {room.freeUnits} left
                          </Badge>
                        )}
                      </div>
                      <p className="flex items-center gap-2 text-small text-muted">
                        <Users className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden />
                        {occupancyLabel(room)}
                      </p>
                      {room.from && !soldOut ? (
                        <p>
                          <span className="font-display text-h2 font-medium tabular-nums">
                            {formatInr(room.from.perNightPaise)}
                          </span>{" "}
                          <span className="text-small text-muted">a night, per room</span>
                          <span className="block text-small text-muted tabular-nums">
                            {formatInr(room.from.totalPaise)} for {plural(nights, "night")} incl.{" "}
                            {formatInr(room.from.gstPaise)} GST, {room.from.planName.toLowerCase()}
                          </span>
                        </p>
                      ) : (
                        <p className="text-small text-muted">Not available for these dates.</p>
                      )}
                      <div className="mt-auto flex flex-wrap gap-3 pt-2">
                        <ButtonLink
                          href={`/rooms/${room.slug}?${detailQuery}`}
                          variant="ghost"
                          className="px-3"
                        >
                          View details
                        </ButtonLink>
                        <Button
                          variant="secondary"
                          disabled={!!blocked}
                          onClick={() => addRoom(room)}
                          aria-describedby={blocked ? `add-${room.id}-why` : undefined}
                        >
                          <Plus className="size-[18px]" strokeWidth={1.5} aria-hidden />
                          Add room
                        </Button>
                      </div>
                      {inStay > 0 || (blocked && !soldOut) ? (
                        <p id={`add-${room.id}-why`} className="text-small text-muted">
                          {blocked && !soldOut
                            ? blocked
                            : `${plural(inStay, "room")} in your stay, ${leftToAdd} more free`}
                        </p>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---- Your stay ----------------------------------------------------- */}
        <section aria-labelledby="stay-heading" className="flex flex-col gap-4">
          <div>
            <h2 id="stay-heading" className="font-display text-h1 font-medium">
              Your stay
            </h2>
            <p className="mt-1 text-small text-muted">
              Up to {MAX_CART_ROOMS} rooms in one booking. Rooms can be different types.
            </p>
          </div>

          {dropped ? (
            <p className="flex items-start gap-2 text-small text-warning" role="status">
              <CircleAlert className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.5} aria-hidden />
              Some rooms in the link could not be read and were left out. Check your rooms below.
            </p>
          ) : null}

          {lines.length === 0 ? (
            <Card className="flex flex-col items-start gap-3 border-dashed">
              <p className="text-body">Add rooms above to build your stay.</p>
              {needsEnquiry ? (
                <p className="text-small text-muted">
                  {groupTooBig
                    ? "Your group needs more than 4 rooms."
                    : "We do not have enough rooms free to fit your whole group on these dates."}{" "}
                  <Link href={groupHref} className="font-semibold text-accent hover:underline">
                    Send a group enquiry
                  </Link>{" "}
                  and we will arrange it.
                </p>
              ) : (
                <Button
                  variant="secondary"
                  disabled={!fresh || !suggested}
                  onClick={() => suggested && update(suggested)}
                >
                  Suggest rooms for my group
                </Button>
              )}
            </Card>
          ) : null}

          <ol className="flex flex-col gap-4" aria-live="polite">
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
                        <h3 className="font-display text-h2 font-medium">
                          Room {i + 1}
                          {room ? <span className="text-muted">, {room.name}</span> : null}
                        </h3>
                        {room ? (
                          <p className="text-small text-muted">{occupancyLabel(room)}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold tabular-nums">
                          {priceLine ? formatInr(priceLine.totalPaise) : pending ? "…" : ""}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-11 px-0"
                          aria-label={`Remove room ${i + 1}`}
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
                          const own = r.id === line.roomTypeId;
                          const free = r.freeUnits;
                          // Switching to r takes one more r: only while one is still free.
                          const off = !own && (!r.plans.length || roomsLeftToAdd(r, lines) === 0);
                          return (
                            <option key={r.id} value={r.id} disabled={off}>
                              {r.name}
                              {free === 0 ? " (sold out)" : ` (${free} left)`}
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
                        hint={
                          room ? `Up to ${plural(room.maxOccupancy, "guest")} in all` : undefined
                        }
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

          {lines.length > 0 ? (
            <button
              type="button"
              onClick={addNext}
              disabled={atMax || !canAddNext}
              className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-card border border-dashed border-border bg-surface px-5 py-4 text-center transition-colors duration-150 ease-out hover:bg-surface-2 disabled:cursor-not-allowed disabled:hover:bg-surface"
            >
              <span
                className={cn(
                  "inline-flex items-center gap-2 font-semibold",
                  atMax || !canAddNext ? "text-muted" : "text-accent",
                )}
              >
                <Plus className="size-[18px]" strokeWidth={1.5} aria-hidden />
                Add a room
              </span>
              <span className="text-small text-muted">
                {atMax
                  ? `${MAX_CART_ROOMS} rooms is the most we book online.`
                  : !canAddNext
                    ? "No more rooms are free for these dates."
                    : toPlace > 0
                      ? `For the ${plural(toPlace, "guest")} still to place.`
                      : "Rooms can be different types."}
              </span>
            </button>
          ) : null}
          {atMax || needsEnquiry ? (
            <p className="text-small text-muted">
              Need more rooms than this?{" "}
              <Link href={groupHref} className="font-semibold text-accent hover:underline">
                Send a group enquiry
              </Link>
              .
            </p>
          ) : null}
        </section>
      </div>

      {/* ---- Summary --------------------------------------------------------- */}
      <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Stay summary">
        <Card className="flex flex-col gap-5">
          <div aria-live="polite">
            <p
              className={cn(
                "flex items-center gap-2 font-display text-[2rem] leading-10 font-medium tabular-nums",
                count.kind === "placed" && "text-success",
                count.kind === "over" && "text-warning",
              )}
            >
              {count.kind === "placed" ? (
                <Check className="size-7 shrink-0" strokeWidth={1.5} aria-hidden />
              ) : null}
              {counterText}
            </p>
            <p className="mt-1 text-small text-muted tabular-nums">
              {placed} of {plural(total, "guest")} placed in {plural(lines.length, "room")}
              {count.kind === "left" ? `: ${count.text}` : ""}
            </p>
          </div>

          <fieldset className="flex flex-col gap-3 border-t border-border pt-4">
            <legend className="sr-only">Your group</legend>
            <p className="text-small font-semibold">Your group</p>
            <Stepper
              label="Adults"
              hint="Age 13 and over"
              value={group.adults}
              min={1}
              max={SEARCH_LIMITS.maxGuests}
              onChange={(adults) => update(lines, { ...group, adults })}
            />
            <Stepper
              label="Children"
              hint="Age 12 and under"
              value={group.children}
              min={0}
              max={SEARCH_LIMITS.maxGuests}
              onChange={(children) => update(lines, { ...group, children })}
            />
            {group.adults + group.children > SEARCH_LIMITS.maxGuests ? (
              <p className="text-small text-warning">
                Online booking is for up to {SEARCH_LIMITS.maxGuests} guests.{" "}
                <Link href={groupHref} className="font-semibold text-accent hover:underline">
                  Send a group enquiry
                </Link>
                .
              </p>
            ) : null}
          </fieldset>

          {lines.length ? (
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
          ) : null}

          <div className="min-h-[60px] border-t border-border pt-4" aria-live="polite">
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
                  : lines.length
                    ? "The total shows once every room is set."
                    : "Your total shows here as you add rooms."}
              </p>
            )}
          </div>

          <Button className="w-full" disabled={!state.ok} onClick={goNext}>
            Continue
          </Button>
          <p className="text-small text-muted" aria-live="polite">
            {state.ok ? "Next, your details. Rooms are held when you confirm them." : state.reason}
          </p>
        </Card>
      </aside>

      {/* Small screens: what is left to place, the total and Continue stay in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 border-t border-border bg-surface px-4 py-3 lg:hidden">
        <div className="min-w-0">
          <p
            className={cn(
              "text-small font-semibold",
              count.kind === "placed" ? "text-success" : count.kind === "over" && "text-warning",
            )}
          >
            {count.kind === "placed"
              ? "Everyone placed"
              : count.kind === "over"
                ? "Too many placed"
                : `${toPlace} to place`}
          </p>
          <p className="font-display text-h2 font-medium tabular-nums">
            {priced ? formatInr(priced.totalPaise) : "—"}
          </p>
        </div>
        <Button disabled={!state.ok} onClick={goNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
