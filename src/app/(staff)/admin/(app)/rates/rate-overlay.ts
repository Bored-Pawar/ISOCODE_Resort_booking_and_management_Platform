import { dayOfWeek } from "@/modules/admin/rules";

/**
 * Optimistic prices for the rates grid (audit M01). A saved cell shows its new price only until
 * the refreshed server rows arrive; the server rows are the truth after that.
 *
 * Every save gets a version from one counter, taken when the save starts. Refreshed rows carry the
 * version of the save that asked for them (`refreshedThrough`), so:
 * - an overlay whose value now equals the server value, or whose version is not newer than the last
 *   refresh, is dropped when rows arrive;
 * - a successful bulk save drops every overlay inside its rooms, plans, dates and weekdays;
 * - a late response (an older version) cannot put back an overlay that a newer bulk save or refresh
 *   already replaced.
 */

export type CellKey = string; // `${roomTypeId}|${ratePlanId}|${date}`
export const cellKey = (roomTypeId: string, ratePlanId: string, date: string): CellKey =>
  `${roomTypeId}|${ratePlanId}|${date}`;

export type Overlay = { value: number; version: number; planCode: string };
export type BulkScope = {
  roomTypeIds: string[];
  planCodes: string[];
  from: string;
  to: string;
  days: number[];
};
export type OverlayState = {
  overrides: Record<CellKey, Overlay>;
  /** Bulk saves not yet covered by a refresh: they block older single-cell responses. */
  clears: { scope: BulkScope; version: number }[];
  /** Highest save version whose refresh was requested. */
  refreshRequested: number;
  /** Highest save version the current server rows include. */
  refreshedThrough: number;
};

export const emptyOverlay: OverlayState = {
  overrides: {},
  clears: [],
  refreshRequested: 0,
  refreshedThrough: 0,
};

export type OverlayAction =
  | { type: "saved"; key: CellKey; planCode: string; value: number; version: number }
  | { type: "bulkSaved"; scope: BulkScope; version: number }
  | { type: "refreshRequested"; version: number }
  | { type: "rowsArrived"; server: (key: CellKey) => number | undefined };

function covers(scope: BulkScope, key: CellKey, planCode: string): boolean {
  const [roomTypeId, , date] = key.split("|");
  return (
    scope.roomTypeIds.includes(roomTypeId) &&
    scope.planCodes.includes(planCode) &&
    date >= scope.from &&
    date <= scope.to &&
    scope.days.includes(dayOfWeek(date))
  );
}

export function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case "saved": {
      const { key, planCode, value, version } = action;
      if (version <= state.refreshedThrough) return state;
      if (state.clears.some((c) => c.version > version && covers(c.scope, key, planCode)))
        return state;
      const current = state.overrides[key];
      if (current && current.version > version) return state;
      return { ...state, overrides: { ...state.overrides, [key]: { value, version, planCode } } };
    }
    case "bulkSaved": {
      const overrides: Record<CellKey, Overlay> = {};
      for (const [key, o] of Object.entries(state.overrides)) {
        if (o.version > action.version || !covers(action.scope, key, o.planCode))
          overrides[key] = o;
      }
      return {
        ...state,
        overrides,
        clears: [...state.clears, { scope: action.scope, version: action.version }],
      };
    }
    case "refreshRequested":
      return { ...state, refreshRequested: Math.max(state.refreshRequested, action.version) };
    case "rowsArrived": {
      const through = Math.max(state.refreshedThrough, state.refreshRequested);
      const overrides: Record<CellKey, Overlay> = {};
      for (const [key, o] of Object.entries(state.overrides)) {
        if (o.version > through && action.server(key) !== o.value) overrides[key] = o;
      }
      return {
        ...state,
        overrides,
        clears: state.clears.filter((c) => c.version > through),
        refreshedThrough: through,
      };
    }
  }
}

/** Price shown (and seeded into the editor) for a cell, in paise. */
export function shownPrice(
  state: OverlayState,
  key: CellKey,
  server: number | undefined,
): number | undefined {
  return state.overrides[key]?.value ?? server;
}
