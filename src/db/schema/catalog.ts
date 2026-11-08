import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

export const roomTypes = pgTable(
  "room_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    totalUnits: integer("total_units").notNull(),
    maxAdults: integer("max_adults").notNull(),
    /** Stored, not enforced (B10 rule 1). */
    maxChildren: integer("max_children").notNull(),
    /** B10: adults + children per room may not exceed this. */
    maxOccupancy: integer("max_occupancy").notNull(),
    amenities: jsonb("amenities").$type<string[]>().notNull().default([]),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    check("room_types_total_units_check", sql`${t.totalUnits} > 0`),
    check("room_types_max_occupancy_check", sql`${t.maxOccupancy} >= ${t.maxAdults}`),
  ],
);

export const roomPhotos = pgTable("room_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomTypeId: uuid("room_type_id")
    .notNull()
    .references(() => roomTypes.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: text("alt").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  blurData: text("blur_data"),
  sort: integer("sort").notNull().default(0),
});

export const ratePlans = pgTable(
  "rate_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    inclusions: text("inclusions").notNull(),
    refundable: boolean("refundable").notNull().default(true),
    active: boolean("active").notNull().default(true),
  },
  (t) => [check("rate_plans_code_check", sql`${t.code} IN ('EP','CP','MAP')`)],
);

export const dailyRates = pgTable(
  "daily_rates",
  {
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    ratePlanId: uuid("rate_plan_id")
      .notNull()
      .references(() => ratePlans.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    pricePaise: integer("price_paise").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.roomTypeId, t.ratePlanId, t.date] }),
    check("daily_rates_price_check", sql`${t.pricePaise} > 0`),
  ],
);

export const taxSlabs = pgTable("tax_slabs", {
  id: uuid("id").primaryKey().defaultRandom(),
  minPaise: integer("min_paise").notNull(),
  /** null = no upper cap */
  maxPaise: integer("max_paise"),
  gstBp: integer("gst_bp").notNull(),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
});

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    kind: text("kind").notNull(),
    value: integer("value").notNull(),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validTo: date("valid_to", { mode: "string" }).notNull(),
    minNights: integer("min_nights").notNull().default(1),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    check("promo_codes_kind_check", sql`${t.kind} IN ('pct','flat')`),
    check("promo_codes_value_check", sql`${t.value} > 0`),
    check("promo_codes_used_count_check", sql`${t.usedCount} >= 0`),
  ],
);
