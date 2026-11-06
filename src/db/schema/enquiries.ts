import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

export const enquiries = pgTable(
  "enquiries",
  {
    /** ENQ-xxxx */
    id: text("id").primaryKey(),
    channel: text("channel").notNull(),
    senderName: text("sender_name").notNull(),
    senderContact: text("sender_contact").notNull(),
    rawText: text("raw_text").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    category: text("category"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    extracted: jsonb("extracted"),
    aiStatus: text("ai_status").notNull().default("pending"),
    aiAttempts: integer("ai_attempts").notNull().default(0),
    aiLastError: text("ai_last_error"),
    aiUpdatedAt: timestamp("ai_updated_at", { withTimezone: true }).notNull().defaultNow(),
    lane: text("lane").notNull().default("unsorted"),
    ownerId: uuid("owner_id").references(() => users.id),
    status: text("status").notNull().default("new"),
    isComplaint: boolean("is_complaint").notNull().default(false),
    firstReplyAt: timestamp("first_reply_at", { withTimezone: true }),
  },
  (t) => [
    check("enquiries_channel_check", sql`${t.channel} IN ('web','email','whatsapp','event_form')`),
    check(
      "enquiries_category_check",
      sql`${t.category} IS NULL OR ${t.category} IN ('room','wedding','offsite','complaint','other')`,
    ),
    check(
      "enquiries_ai_status_check",
      sql`${t.aiStatus} IN ('pending','processing','ok','fallback','failed')`,
    ),
    check("enquiries_lane_check", sql`${t.lane} IN ('sorted','unsorted')`),
    check("enquiries_status_check", sql`${t.status} IN ('new','assigned','replied','closed')`),
    index("enquiries_lane_status_idx").on(t.lane, t.status),
    index("enquiries_owner_status_idx").on(t.ownerId, t.status),
    index("enquiries_ai_status_idx").on(t.aiStatus, t.aiUpdatedAt),
  ],
);

export const eventDetails = pgTable("event_details", {
  enquiryId: text("enquiry_id")
    .primaryKey()
    .references(() => enquiries.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  dateFrom: date("date_from", { mode: "string" }),
  dateTo: date("date_to", { mode: "string" }),
  guests: integer("guests"),
  budgetPaise: integer("budget_paise"),
  needs: jsonb("needs"),
});

export const replyDrafts = pgTable("reply_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  enquiryId: text("enquiry_id")
    .notNull()
    .references(() => enquiries.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  quote: jsonb("quote"),
  provider: text("provider").notNull(),
  model: text("model"),
  promptVersion: text("prompt_version").notNull(),
  edited: boolean("edited").notNull().default(false),
  approvedBy: uuid("approved_by").references(() => users.id),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const enquiryEvents = pgTable(
  "enquiry_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "enquiry_events_action_check",
      sql`${t.action} IN ('classified','rerouted','edited','sent','closed')`,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("notifications_kind_check", sql`${t.kind} IN ('complaint','unsorted')`)],
);

export const exportRuns = pgTable("export_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  runDate: date("run_date", { mode: "string" }).notNull().unique(),
  rowCount: integer("row_count").notNull(),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
