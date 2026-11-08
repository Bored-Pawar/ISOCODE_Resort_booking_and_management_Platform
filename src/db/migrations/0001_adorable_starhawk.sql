-- B10 multi-room (docs/s2-multiroom-change.md section 2). No backfill: development and test are
-- reset and reseeded. On a database that already holds bookings this migration fails on the
-- NOT NULL columns, by design; it is never run against production without a reviewed plan.
CREATE TABLE "booking_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"line_no" smallint NOT NULL,
	"room_type_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"adults" integer NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"gst_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	CONSTRAINT "booking_rooms_booking_line_unique" UNIQUE("booking_id","line_no"),
	CONSTRAINT "booking_rooms_line_no_check" CHECK ("booking_rooms"."line_no" BETWEEN 1 AND 4),
	CONSTRAINT "booking_rooms_adults_check" CHECK ("booking_rooms"."adults" >= 1),
	CONSTRAINT "booking_rooms_children_check" CHECK ("booking_rooms"."children" >= 0)
);
--> statement-breakpoint
ALTER TABLE "booking_rooms" ADD CONSTRAINT "booking_rooms_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_rooms" ADD CONSTRAINT "booking_rooms_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_rooms" ADD CONSTRAINT "booking_rooms_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_rooms_booking_idx" ON "booking_rooms" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_rooms_room_type_idx" ON "booking_rooms" USING btree ("room_type_id");--> statement-breakpoint
ALTER TABLE "booking_nights" DROP CONSTRAINT "booking_nights_booking_id_date_pk";--> statement-breakpoint
ALTER TABLE "booking_nights" DROP CONSTRAINT "booking_nights_booking_id_bookings_id_fk";--> statement-breakpoint
ALTER TABLE "booking_nights" DROP COLUMN "booking_id";--> statement-breakpoint
ALTER TABLE "booking_nights" ADD COLUMN "booking_room_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_nights" ADD CONSTRAINT "booking_nights_booking_room_id_date_pk" PRIMARY KEY("booking_room_id","date");--> statement-breakpoint
ALTER TABLE "booking_nights" ADD CONSTRAINT "booking_nights_booking_room_id_booking_rooms_id_fk" FOREIGN KEY ("booking_room_id") REFERENCES "public"."booking_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_units_check";--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_room_type_id_room_types_id_fk";--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_rate_plan_id_rate_plans_id_fk";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "room_type_id";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "rate_plan_id";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "units";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "adults";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "children";--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "max_occupancy" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_max_occupancy_check" CHECK ("room_types"."max_occupancy" >= "room_types"."max_adults");
