"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import type { AffectedBooking } from "@/modules/admin";
import { bookingsInRangeAction, setOfflineAction, setOnlineAction } from "./actions";

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fmt = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

type Mode = "offline" | "online";

/**
 * A3: take a room type (or all rooms) offline for a range with a reason, or bring it back online.
 * Going offline first lists the bookings already on those dates (they stand), then asks to
 * confirm. Offline dates block new holds only.
 */
export function AvailabilityPanel({
  rooms,
  defaultRoom,
  from: initialFrom,
  to: initialTo,
  window,
  onDone,
}: {
  rooms: { id: string; name: string }[];
  defaultRoom: string;
  from: string;
  to: string;
  window: { first: string; last: string };
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("offline");
  const [room, setRoom] = useState(defaultRoom);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** Bookings found for the exact choices below; null until reviewed. */
  const [review, setReview] = useState<{ key: string; bookings: AffectedBooking[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const roomTypeId = room === "all" ? null : room;
  const key = `${room}|${from}|${to}`;
  const reviewed = review?.key === key ? review.bookings : null;
  const roomName = roomTypeId
    ? (rooms.find((r) => r.id === roomTypeId)?.name ?? "Room")
    : "All rooms";

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setErrors({});
    };

  const check = () =>
    startTransition(async () => {
      setErrors({});
      const res = await bookingsInRangeAction({ roomTypeId, from, to });
      if (!res.ok) {
        setErrors(
          res.code === "FORBIDDEN" ? { form: "Your role cannot change online dates." } : res.errors,
        );
        return;
      }
      setReview({ key, bookings: res.bookings });
    });

  const takeOffline = () =>
    startTransition(async () => {
      const res = await setOfflineAction({ roomTypeId, from, to, reason });
      if (!res.ok) {
        if (res.code === "FORBIDDEN") setErrors({ form: "Your role cannot change online dates." });
        else if (res.code === "NOT_FOUND") setErrors({ form: "That room type no longer exists." });
        else setErrors(res.errors);
        return;
      }
      setReview(null);
      setReason("");
      onDone(
        `${roomName} offline ${fmt(res.blackout.startDate)} to ${fmt(res.blackout.endDate)}.${res.merged ? " Joined with the offline dates next to it." : ""}`,
      );
    });

  const bringOnline = () =>
    startTransition(async () => {
      const res = await setOnlineAction({ roomTypeId, from, to });
      if (!res.ok) {
        if (res.code === "FORBIDDEN") setErrors({ form: "Your role cannot change online dates." });
        else if (res.code === "ALL_ROOMS_OFFLINE")
          setErrors({
            form: `All rooms are offline ${fmt(res.blackout.startDate)} to ${fmt(res.blackout.endDate)} (${res.blackout.reason ?? "no reason given"}). Choose All rooms to bring those dates online.`,
          });
        else setErrors(res.errors);
        return;
      }
      const changed = res.removed + res.trimmed + res.split;
      onDone(
        changed
          ? `${roomName} online ${fmt(from)} to ${fmt(to)}.`
          : `${roomName} was already online ${fmt(from)} to ${fmt(to)}.`,
      );
    });

  return (
    <Card className="flex flex-col gap-4 self-start">
      <h2 className="text-h2">Online dates</h2>
      <div role="radiogroup" aria-label="Change" className="grid grid-cols-2 gap-2">
        {(["offline", "online"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => change(setMode)(m)}
            className={
              mode === m
                ? "h-11 rounded-control border border-accent bg-accent-soft text-small font-semibold text-accent"
                : "h-11 rounded-control border border-border text-small font-semibold hover:bg-surface-2"
            }
          >
            {m === "offline" ? "Take offline" : "Bring online"}
          </button>
        ))}
      </div>
      <Select label="Rooms" value={room} onChange={(e) => change(setRoom)(e.target.value)}>
        <option value="all">All rooms</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="From"
          type="date"
          min={window.first}
          max={window.last}
          value={from}
          onChange={(e) => change(setFrom)(e.target.value)}
          error={errors.from}
        />
        <Input
          label="To (inclusive)"
          type="date"
          min={from || window.first}
          max={window.last}
          value={to}
          onChange={(e) => change(setTo)(e.target.value)}
          error={errors.to}
        />
      </div>
      {mode === "offline" ? (
        <>
          <Textarea
            label="Reason"
            rows={2}
            maxLength={200}
            placeholder="e.g. Plunge pool resurfacing"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={errors.reason}
            help="Staff see it on the hatched dates."
          />
          {reviewed ? (
            <div
              className="flex flex-col gap-2 rounded-control border border-warning/40 bg-warning/10 p-3"
              role="status"
            >
              <p className="flex items-start gap-2 text-small font-semibold">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                {reviewed.length
                  ? `${reviewed.length} ${reviewed.length === 1 ? "booking stays" : "bookings stay"} on these dates. Only new holds are blocked.`
                  : "No bookings on these dates."}
              </p>
              {reviewed.length ? (
                <ul className="max-h-40 overflow-auto text-small tabular-nums">
                  {reviewed.map((b) => (
                    <li key={b.id} className="flex justify-between gap-2 py-0.5">
                      <Link
                        href={`/admin/bookings/${encodeURIComponent(b.ref)}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        {b.ref}
                      </Link>
                      <span className="text-muted">
                        {fmt(b.checkIn)} to {fmt(b.checkOut)}, {b.status.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-small text-muted">
          Removes offline dates in this range for {roomName.toLowerCase()}. Offline days outside the
          range stay offline.
        </p>
      )}
      {errors.form ? (
        <p role="alert" className="text-small text-danger">
          {errors.form}
        </p>
      ) : null}
      {mode === "offline" ? (
        reviewed ? (
          <Button onClick={takeOffline} loading={pending} disabled={reason.trim().length < 3}>
            Take offline
          </Button>
        ) : (
          <Button onClick={check} loading={pending}>
            Check bookings first
          </Button>
        )
      ) : (
        <Button onClick={bringOnline} loading={pending}>
          Bring online
        </Button>
      )}
    </Card>
  );
}
