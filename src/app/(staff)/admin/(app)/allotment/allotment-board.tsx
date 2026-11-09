"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarOff, SlidersHorizontal, X } from "lucide-react";
import { Button, Card, DataGrid, Input, Select, useToast, type GridRow } from "@/components/ui";
import { addDays } from "@/lib/dates";
import {
  bulkPreview,
  GRID_DAYS,
  previewLine,
  rejectionMessage,
  ALL_DAYS,
} from "@/modules/admin/rules";
import { freeLabel, stockLabel } from "@/modules/admin/rules";
import type { AllotmentGridRow, BlackoutRow, RejectedAllotment } from "@/modules/admin";
import { ConnectionAlert } from "../_components/connection-alert";
import { CheckGroup, dateColumns, DateStepper, DayPicker } from "../_components/grid-dates";
import { send } from "../_components/transport";
import { setAllotmentAction } from "./actions";
import { AvailabilityPanel } from "./availability-panel";

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fmt = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`)).replace(",", "");

function parseCount(text: string): number {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

/** Blackout covering a room type on a date, if any (room-specific first). */
export function offlineOn(blackouts: BlackoutRow[], roomTypeId: string, date: string) {
  const covering = blackouts.filter(
    (b) =>
      (b.roomTypeId === null || b.roomTypeId === roomTypeId) &&
      b.startDate <= date &&
      b.endDate >= date,
  );
  return covering.find((b) => b.roomTypeId === roomTypeId) ?? covering[0] ?? null;
}

export function AllotmentBoard({
  start,
  window,
  room,
  rows,
  blackouts,
  canToggle,
}: {
  start: string;
  window: { first: string; last: string };
  room: string;
  rows: AllotmentGridRow[];
  blackouts: BlackoutRow[];
  canToggle: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [panel, setPanel] = useState<"none" | "bulk" | "online">("none");
  /** Rejected cells keep their red state and reason until the next save or another 30 days. */
  const [rejected, setRejected] = useState<{ start: string; cells: Record<string, string> }>({
    start,
    cells: {},
  });
  const rejectedCells = rejected.start === start ? rejected.cells : {};

  const href = (next: { start?: string; room?: string }) => {
    const p = new URLSearchParams();
    p.set("start", next.start ?? start);
    const r = next.room ?? room;
    if (r !== "all") p.set("room", r);
    return `${pathname}?${p}`;
  };

  const columns = useMemo(() => dateColumns(start), [start]);
  const visible = rows.filter((r) => room === "all" || r.roomTypeId === room);
  const gridRows: GridRow[] = visible.map((r) => {
    const cells: GridRow["cells"] = {};
    const sub: NonNullable<GridRow["sub"]> = {};
    const tone: NonNullable<GridRow["tone"]> = {};
    const note: Record<string, string> = {};
    for (const c of columns) {
      const n = r.nights[c.key];
      cells[c.key] = n ? n.allotment : null;
      if (n) sub[c.key] = stockLabel(n.sold, n.held);
      const off = offlineOn(blackouts, r.roomTypeId, c.key);
      if (off) tone[c.key] = "offline";
      const why = rejectedCells[`${r.roomTypeId}|${c.key}`];
      if (why) tone[c.key] = "danger";
      note[c.key] = [
        why,
        off
          ? `Offline${off.roomTypeId === null ? " (all rooms)" : ""}: ${off.reason ?? "no reason given"}`
          : null,
        n ? freeLabel(n) : "No stock row yet. Set a number to create it.",
      ]
        .filter(Boolean)
        .join(". ");
    }
    return {
      id: r.roomTypeId,
      name: r.name,
      label: (
        <span className="flex flex-col leading-tight">
          <span>{r.name}</span>
          <span className="text-xs font-normal text-muted">{r.totalUnits} rooms in total</span>
        </span>
      ),
      cells,
      sub,
      tone,
      note,
    };
  });

  const markRejected = (list: RejectedAllotment[], clear: string[]) =>
    setRejected((s) => {
      const cells = { ...(s.start === start ? s.cells : {}) };
      for (const k of clear) delete cells[k];
      for (const r of list) cells[`${r.roomTypeId}|${r.date}`] = rejectionMessage(r);
      return { start, cells };
    });

  const commit = async (roomTypeId: string, date: string, text: string) => {
    const allotment = parseCount(text);
    if (Number.isNaN(allotment)) return "Enter a whole number of rooms, 0 or more.";
    const res = await setAllotmentAction({
      mode: "cells",
      cells: [{ roomTypeId, date, allotment }],
    });
    if (!res.ok) {
      if (res.code === "FORBIDDEN") return "Your role cannot change allotment.";
      return Object.values(res.errors)[0] ?? "Could not save. Try again.";
    }
    const key = `${roomTypeId}|${date}`;
    markRejected(res.rejected, [key]);
    router.refresh();
    if (res.rejected.length) return rejectionMessage(res.rejected[0]);
  };

  const names = new Map(rows.map((r) => [r.roomTypeId, r.name]));

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Room type"
          className="w-full sm:w-56"
          value={room}
          onChange={(e) => router.push(href({ room: e.target.value }))}
        >
          <option value="all">All room types</option>
          {rows.map((r) => (
            <option key={r.roomTypeId} value={r.roomTypeId}>
              {r.name}
            </option>
          ))}
        </Select>
        <DateStepper start={start} window={window} hrefFor={(s) => href({ start: s })} />
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {canToggle ? (
            <Button
              variant="secondary"
              onClick={() => setPanel((p) => (p === "online" ? "none" : "online"))}
              aria-expanded={panel === "online"}
            >
              {panel === "online" ? (
                <X className="size-[18px]" aria-hidden />
              ) : (
                <CalendarOff className="size-[18px]" aria-hidden />
              )}
              {panel === "online" ? "Close online dates" : "Online dates"}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => setPanel((p) => (p === "bulk" ? "none" : "bulk"))}
            aria-expanded={panel === "bulk"}
          >
            {panel === "bulk" ? (
              <X className="size-[18px]" aria-hidden />
            ) : (
              <SlidersHorizontal className="size-[18px]" aria-hidden />
            )}
            {panel === "bulk" ? "Close bulk edit" : "Bulk edit"}
          </Button>
        </div>
      </div>

      <div className={panel !== "none" ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" : ""}>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-small text-muted" id="allotment-legend">
            Big number: rooms the website may sell. Below it, S is sold and H is held (on narrow
            screens). Hover or tap a night for how many are free.
          </p>
          <DataGrid
            caption="Website allotment per night"
            columns={columns}
            rows={gridRows}
            editable
            resetKey={start}
            onCommit={commit}
            emptyMessage="No room types match this filter."
          />
          <p className="text-small text-muted">
            Select a number to change it; Enter saves, Esc cancels.
            {canToggle ? " Hatched dates are offline: no new holds." : ""}
          </p>
        </div>
        {panel === "bulk" ? (
          <BulkAllotment
            rooms={rows.map((r) => ({ id: r.roomTypeId, name: r.name, plans: [] }))}
            defaultRoom={room}
            from={start}
            to={addDays(start, GRID_DAYS - 1)}
            window={window}
            names={names}
            onDone={(updated, list) => {
              markRejected(list, []);
              toast(
                list.length
                  ? `Updated ${updated}. ${list.length} ${list.length === 1 ? "date was" : "dates were"} refused, see the red cells.`
                  : `Updated ${updated} ${updated === 1 ? "night" : "nights"}.`,
                list.length ? "error" : "success",
              );
              router.refresh();
            }}
          />
        ) : null}
        {panel === "online" && canToggle ? (
          <AvailabilityPanel
            rooms={rows.map((r) => ({ id: r.roomTypeId, name: r.name }))}
            defaultRoom={room}
            from={start}
            to={addDays(start, 6)}
            window={window}
            onDone={(message) => {
              toast(message, "success");
              router.refresh();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function BulkAllotment({
  rooms,
  defaultRoom,
  from: initialFrom,
  to: initialTo,
  window,
  names,
  onDone,
}: {
  rooms: { id: string; name: string; plans: string[] }[];
  defaultRoom: string;
  from: string;
  to: string;
  window: { first: string; last: string };
  names: Map<string, string>;
  onDone: (updated: number, rejected: RejectedAllotment[]) => void;
}) {
  const [roomIds, setRoomIds] = useState<string[]>(
    defaultRoom === "all" ? rooms.map((r) => r.id) : [defaultRoom],
  );
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [days, setDays] = useState<number[]>([...ALL_DAYS]);
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [last, setLast] = useState<RejectedAllotment[]>([]);
  /** The last Apply could not reach the server (QA-05): inputs stay, nothing is reported saved. */
  const [lost, setLost] = useState(false);
  const [pending, startTransition] = useTransition();

  const count = parseCount(value);
  const preview = bulkPreview({ rooms, roomTypeIds: roomIds, from, to, days });
  const valueProblem = value && Number.isNaN(count) ? "Enter a whole number, 0 or more." : null;
  const canApply = preview.cells > 0 && !!value && !valueProblem && !pending;

  const apply = () =>
    startTransition(async () => {
      setErrors({});
      setLost(false);
      const sent = await send(() =>
        setAllotmentAction({
          mode: "range",
          roomTypeIds: roomIds,
          from,
          to,
          days,
          allotment: count,
        }),
      );
      if (!sent.sent) {
        setLost(true);
        return;
      }
      const res = sent.value;
      if (!res.ok) {
        setErrors(
          res.code === "FORBIDDEN" ? { form: "Your role cannot change allotment." } : res.errors,
        );
        return;
      }
      setLast(res.rejected);
      onDone(res.updated, res.rejected);
    });

  return (
    <Card className="flex flex-col gap-4 self-start">
      <h2 className="text-h2">Bulk edit</h2>
      <CheckGroup
        legend="Room types"
        options={rooms.map((r) => ({ value: r.id, label: r.name }))}
        value={roomIds}
        onChange={setRoomIds}
        error={errors.roomTypeIds}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="From"
          type="date"
          min={window.first}
          max={window.last}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          error={errors.from}
        />
        <Input
          label="To"
          type="date"
          min={from || window.first}
          max={window.last}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          error={errors.to}
        />
      </div>
      <DayPicker days={days} onChange={setDays} error={errors.days} />
      <Input
        label="Rooms the website may sell"
        inputMode="numeric"
        placeholder="e.g. 6"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={valueProblem ?? errors.allotment}
        help="Check availability outside the website before raising allotment."
      />
      <p className="text-small font-semibold tabular-nums" aria-live="polite">
        {preview.cells
          ? previewLine(preview.cells, preview.rooms, ["night", "nights"])
          : "No nights match these choices."}
      </p>
      {errors.form ? (
        <p role="alert" className="text-small text-danger">
          {errors.form}
        </p>
      ) : null}
      {lost ? <ConnectionAlert onRetry={apply} pending={pending} /> : null}
      <Button onClick={apply} disabled={!canApply} loading={pending}>
        Apply
      </Button>
      {last.length ? (
        <div className="flex flex-col gap-1 border-t border-border pt-3" role="status">
          <p className="text-small font-semibold text-danger">
            Not changed on {last.length} {last.length === 1 ? "date" : "dates"}
          </p>
          <ul className="max-h-48 overflow-auto text-small tabular-nums">
            {last.slice(0, 40).map((r) => (
              <li key={`${r.roomTypeId}|${r.date}`} className="flex justify-between gap-2 py-0.5">
                <span>
                  {names.get(r.roomTypeId) ?? "Room"}, {fmt(r.date)}
                </span>
                <span className="text-muted">{rejectionMessage(r)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
