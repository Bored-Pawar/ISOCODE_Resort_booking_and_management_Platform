"use client";

import { useMemo, useReducer, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Button, Card, DataGrid, Input, Select, useToast, type GridRow } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import {
  bulkPreview,
  GRID_DAYS,
  parseRupees,
  previewLine,
  WEEKEND_DAYS,
} from "@/modules/admin/rules";
import { MAX_RATE_RUPEES } from "@/modules/admin/schemas";
import type { RateGridRow } from "@/modules/admin";
import { CheckGroup, dateColumns, DateStepper, DayPicker } from "../_components/grid-dates";
import { setRatesAction } from "./actions";
import { cellKey, emptyOverlay, overlayReducer, shownPrice, type BulkScope } from "./rate-overlay";

/** One counter for every save on this page; only the order matters (see `rate-overlay.ts`). */
let saveVersion = 0;
const nextVersion = () => ++saveVersion;

type Room = { id: string; name: string; plans: string[] };

const PLAN_NAMES: Record<string, string> = {
  EP: "EP (room only)",
  CP: "CP (with breakfast)",
  MAP: "MAP (breakfast and dinner)",
};

function cellError(text: string): string | null {
  const n = parseRupees(text);
  if (Number.isNaN(n)) return "Enter a price in whole rupees, e.g. 12400.";
  if (n < 1) return "Price must be more than ₹0.";
  if (n > MAX_RATE_RUPEES) return "At most ₹5,00,000 a night.";
  return null;
}

export function RatesBoard({
  start,
  window,
  room,
  rooms,
  rows,
}: {
  start: string;
  window: { first: string; last: string };
  room: string;
  rooms: Room[];
  rows: RateGridRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [bulkOpen, setBulkOpen] = useState(false);
  /** Saved prices shown only until refreshed server rows include them (audit M01). */
  const [overlay, dispatch] = useReducer(overlayReducer, emptyOverlay);
  const [seenRows, setSeenRows] = useState(rows);
  if (rows !== seenRows) {
    // New server rows: retire every overlay they now cover (adjusting state while rendering).
    setSeenRows(rows);
    const server = new Map<string, number>();
    for (const r of rows)
      for (const [date, paise] of Object.entries(r.prices))
        server.set(cellKey(r.roomTypeId, r.ratePlanId, date), paise);
    dispatch({ type: "rowsArrived", server: (key) => server.get(key) });
  }

  const href = (next: { start?: string; room?: string }) => {
    const p = new URLSearchParams();
    p.set("start", next.start ?? start);
    const r = next.room ?? room;
    if (r !== "all") p.set("room", r);
    return `${pathname}?${p}`;
  };

  const names = new Map(rooms.map((r) => [r.id, r.name]));
  const columns = useMemo(() => dateColumns(start), [start]);
  const visible = rows.filter((r) => room === "all" || r.roomTypeId === room);
  const gridRows: GridRow[] = visible.map((r) => {
    const id = `${r.roomTypeId}|${r.ratePlanId}`;
    const cells: GridRow["cells"] = {};
    const display: Record<string, string> = {};
    for (const c of columns) {
      const paise = shownPrice(
        overlay,
        cellKey(r.roomTypeId, r.ratePlanId, c.key),
        r.prices[c.key],
      );
      cells[c.key] = paise === undefined ? null : paise / 100;
      display[c.key] = paise === undefined ? "No rate" : formatInr(paise);
    }
    const roomName = names.get(r.roomTypeId) ?? "Room";
    return {
      id,
      name: `${roomName} ${r.planCode}`,
      label: (
        <span className="flex flex-col leading-tight">
          <span>{roomName}</span>
          <span className="text-xs font-normal text-muted">
            {PLAN_NAMES[r.planCode] ?? r.planCode}
          </span>
        </span>
      ),
      cells,
      display,
    };
  });

  const commit = async (rowId: string, date: string, text: string) => {
    const problem = cellError(text);
    if (problem) return problem;
    const [roomTypeId, ratePlanId] = rowId.split("|");
    const planCode = rows.find((r) => r.ratePlanId === ratePlanId)?.planCode ?? "";
    const rupees = parseRupees(text);
    const version = nextVersion();
    const res = await setRatesAction({
      mode: "cells",
      cells: [{ roomTypeId, ratePlanId, date, rupees }],
    });
    if (!res.ok) {
      if (res.code === "FORBIDDEN") return "Your role cannot change rates.";
      return Object.values(res.errors)[0] ?? "Could not save. Try again.";
    }
    dispatch({
      type: "saved",
      key: cellKey(roomTypeId, ratePlanId, date),
      planCode,
      value: rupees * 100,
      version,
    });
    dispatch({ type: "refreshRequested", version });
    router.refresh();
  };

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
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <DateStepper start={start} window={window} hrefFor={(s) => href({ start: s })} />
        <Button
          variant="secondary"
          className="sm:ml-auto"
          onClick={() => setBulkOpen((o) => !o)}
          aria-expanded={bulkOpen}
        >
          {bulkOpen ? (
            <X className="size-[18px]" aria-hidden />
          ) : (
            <SlidersHorizontal className="size-[18px]" aria-hidden />
          )}
          {bulkOpen ? "Close bulk edit" : "Bulk edit"}
        </Button>
      </div>

      <div className={bulkOpen ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" : ""}>
        <div className="flex min-w-0 flex-col gap-2">
          <DataGrid
            caption="Nightly rates in rupees"
            columns={columns}
            rows={gridRows}
            editable
            resetKey={start}
            onCommit={commit}
            emptyMessage="No active rate plans for this room type."
          />
          <p className="text-small text-muted">
            Select a price to change it. Enter saves, Esc cancels. Shaded columns are Friday and
            Saturday nights.
          </p>
        </div>
        {bulkOpen ? (
          <BulkPanel
            rooms={rooms}
            defaultRoom={room}
            from={start}
            to={addDays(start, GRID_DAYS - 1)}
            window={window}
            onDone={(changed, scope, version) => {
              dispatch({ type: "bulkSaved", scope, version });
              dispatch({ type: "refreshRequested", version });
              toast(
                changed
                  ? `Updated ${changed} ${changed === 1 ? "price" : "prices"}.`
                  : "Prices already matched. Nothing changed.",
                "success",
              );
              router.refresh();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function BulkPanel({
  rooms,
  defaultRoom,
  from: initialFrom,
  to: initialTo,
  window,
  onDone,
}: {
  rooms: Room[];
  defaultRoom: string;
  from: string;
  to: string;
  window: { first: string; last: string };
  onDone: (changed: number, scope: BulkScope, version: number) => void;
}) {
  const [roomIds, setRoomIds] = useState<string[]>(
    defaultRoom === "all" ? rooms.map((r) => r.id) : [defaultRoom],
  );
  const [codes, setCodes] = useState<string[]>(["EP", "CP", "MAP"]);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [days, setDays] = useState<number[]>([...WEEKEND_DAYS]);
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const preview = bulkPreview({ rooms, roomTypeIds: roomIds, planCodes: codes, from, to, days });
  const priceProblem = price ? cellError(price) : null;
  const canApply = preview.cells > 0 && !!price && !priceProblem && !pending;

  const apply = () =>
    startTransition(async () => {
      setErrors({});
      const scope: BulkScope = { roomTypeIds: roomIds, planCodes: codes, from, to, days };
      const version = nextVersion();
      const res = await setRatesAction({ mode: "range", ...scope, rupees: parseRupees(price) });
      if (!res.ok) {
        setErrors(
          res.code === "FORBIDDEN" ? { form: "Your role cannot change rates." } : res.errors,
        );
        return;
      }
      onDone(res.changed, scope, version);
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
      <CheckGroup
        legend="Plans"
        options={["EP", "CP", "MAP"].map((c) => ({ value: c, label: PLAN_NAMES[c] }))}
        value={codes}
        onChange={setCodes}
        error={errors.planCodes}
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
        label="Price per night (₹, before GST)"
        inputMode="numeric"
        placeholder="e.g. 12400"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        error={priceProblem ?? errors.rupees}
      />
      <p className="text-small font-semibold tabular-nums" aria-live="polite">
        {preview.cells
          ? previewLine(preview.cells, preview.rooms, ["price", "prices"])
          : "No prices match these choices."}
      </p>
      {errors.form ? (
        <p role="alert" className="text-small text-danger">
          {errors.form}
        </p>
      ) : null}
      <Button onClick={apply} disabled={!canApply} loading={pending}>
        Apply
      </Button>
    </Card>
  );
}
