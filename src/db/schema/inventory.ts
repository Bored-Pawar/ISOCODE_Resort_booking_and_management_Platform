import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { roomTypes } from "./catalog";
import { users } from "./identity";

export const inventory = pgTable(
  "inventory",
  {
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    allotment: integer("allotment").notNull(),
    sold: integer("sold").notNull().default(0),
    held: integer("held").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.roomTypeId, t.date] }),
    check("inventory_allotment_check", sql`${t.allotment} >= 0`),
    check("inventory_sold_check", sql`${t.sold} >= 0`),
    check("inventory_held_check", sql`${t.held} >= 0`),
    check("inventory_capacity_check", sql`${t.sold} + ${t.held} <= ${t.allotment}`),
  ],
);

export const blackoutDates = pgTable(
  "blackout_dates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = all room types */
    roomTypeId: uuid("room_type_id").references(() => roomTypes.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (t) => [check("blackout_dates_range_check", sql`${t.endDate} >= ${t.startDate}`)],
);
