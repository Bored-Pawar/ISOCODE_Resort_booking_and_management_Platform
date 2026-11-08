/**
 * Admin services (S2 admin runbook): the only entry point UI and server actions use for A1 to A4.
 * The writes live next to the tables they own (`pricing/admin.ts`, `inventory/admin.ts`); each
 * checks the actor's capability and validates with Zod itself. Client components import the pure
 * `./rules` and `./schemas` directly (no database code), like fixtures.
 */
import {
  createPromo,
  deactivatePromo,
  listPromos,
  readRates,
  setRates,
} from "@/modules/pricing/admin";
import {
  bookingsInRange,
  readAllotment,
  setAllotment,
  setOffline,
  setOnline,
} from "@/modules/inventory/admin";

export * from "./rules";
export * from "./schemas";
export type {
  CreatePromoResult,
  DeactivatePromoResult,
  PromoRow,
  RateGridRow,
  SetRatesResult,
} from "@/modules/pricing/admin";
export type {
  AffectedBooking,
  AllotmentGridRow,
  BlackoutRow,
  RejectedAllotment,
  SetAllotmentResult,
  SetOfflineResult,
  SetOnlineResult,
} from "@/modules/inventory/admin";

export const admin = {
  setRates,
  readRates,
  listPromos,
  createPromo,
  deactivatePromo,
  setAllotment,
  readAllotment,
  bookingsInRange,
  setOffline,
  setOnline,
};
