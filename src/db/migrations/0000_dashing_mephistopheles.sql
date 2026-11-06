CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"role" text NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('guest','reservations','sales','gm'))
);
--> statement-breakpoint
CREATE TABLE "daily_rates" (
	"room_type_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"price_paise" integer NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_rates_room_type_id_rate_plan_id_date_pk" PRIMARY KEY("room_type_id","rate_plan_id","date"),
	CONSTRAINT "daily_rates_price_check" CHECK ("daily_rates"."price_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date NOT NULL,
	"min_nights" integer DEFAULT 1 NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "promo_codes_kind_check" CHECK ("promo_codes"."kind" IN ('pct','flat')),
	CONSTRAINT "promo_codes_value_check" CHECK ("promo_codes"."value" > 0),
	CONSTRAINT "promo_codes_used_count_check" CHECK ("promo_codes"."used_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rate_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_type_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"inclusions" text NOT NULL,
	"refundable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "rate_plans_code_check" CHECK ("rate_plans"."code" IN ('EP','CP','MAP'))
);
--> statement-breakpoint
CREATE TABLE "room_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_type_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"blur_data" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"total_units" integer NOT NULL,
	"max_adults" integer NOT NULL,
	"max_children" integer NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "room_types_slug_unique" UNIQUE("slug"),
	CONSTRAINT "room_types_total_units_check" CHECK ("room_types"."total_units" > 0)
);
--> statement-breakpoint
CREATE TABLE "tax_slabs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"min_paise" integer NOT NULL,
	"max_paise" integer,
	"gst_bp" integer NOT NULL,
	"effective_from" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blackout_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_type_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"created_by" uuid,
	CONSTRAINT "blackout_dates_range_check" CHECK ("blackout_dates"."end_date" >= "blackout_dates"."start_date")
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"room_type_id" uuid NOT NULL,
	"date" date NOT NULL,
	"allotment" integer NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"held" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_room_type_id_date_pk" PRIMARY KEY("room_type_id","date"),
	CONSTRAINT "inventory_allotment_check" CHECK ("inventory"."allotment" >= 0),
	CONSTRAINT "inventory_sold_check" CHECK ("inventory"."sold" >= 0),
	CONSTRAINT "inventory_held_check" CHECK ("inventory"."held" >= 0),
	CONSTRAINT "inventory_capacity_check" CHECK ("inventory"."sold" + "inventory"."held" <= "inventory"."allotment")
);
--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_nights" (
	"booking_id" uuid NOT NULL,
	"date" date NOT NULL,
	"rate_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"gst_bp" integer NOT NULL,
	"gst_paise" integer NOT NULL,
	CONSTRAINT "booking_nights_booking_id_date_pk" PRIMARY KEY("booking_id","date")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"guest_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"units" integer DEFAULT 1 NOT NULL,
	"adults" integer NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"quote_hash" text NOT NULL,
	"promo_id" uuid,
	"subtotal_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"gst_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "bookings_ref_unique" UNIQUE("ref"),
	CONSTRAINT "bookings_units_check" CHECK ("bookings"."units" >= 1),
	CONSTRAINT "bookings_status_check" CHECK ("bookings"."status" IN ('HELD','CONFIRMED','EXPIRED','CANCELLED')),
	CONSTRAINT "bookings_dates_check" CHECK ("bookings"."check_out" > "bookings"."check_in")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" IN ('SUCCESS','FAILED','REFUND_PENDING'))
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_contact" text NOT NULL,
	"raw_text" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text,
	"confidence" numeric(3, 2),
	"extracted" jsonb,
	"ai_status" text DEFAULT 'pending' NOT NULL,
	"ai_attempts" integer DEFAULT 0 NOT NULL,
	"ai_last_error" text,
	"ai_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lane" text DEFAULT 'unsorted' NOT NULL,
	"owner_id" uuid,
	"status" text DEFAULT 'new' NOT NULL,
	"is_complaint" boolean DEFAULT false NOT NULL,
	"first_reply_at" timestamp with time zone,
	CONSTRAINT "enquiries_channel_check" CHECK ("enquiries"."channel" IN ('web','email','whatsapp','event_form')),
	CONSTRAINT "enquiries_category_check" CHECK ("enquiries"."category" IS NULL OR "enquiries"."category" IN ('room','wedding','offsite','complaint','other')),
	CONSTRAINT "enquiries_ai_status_check" CHECK ("enquiries"."ai_status" IN ('pending','processing','ok','fallback','failed')),
	CONSTRAINT "enquiries_lane_check" CHECK ("enquiries"."lane" IN ('sorted','unsorted')),
	CONSTRAINT "enquiries_status_check" CHECK ("enquiries"."status" IN ('new','assigned','replied','closed'))
);
--> statement-breakpoint
CREATE TABLE "enquiry_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiry_events_action_check" CHECK ("enquiry_events"."action" IN ('classified','rerouted','edited','sent','closed'))
);
--> statement-breakpoint
CREATE TABLE "event_details" (
	"enquiry_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"date_from" date,
	"date_to" date,
	"guests" integer,
	"budget_paise" integer,
	"needs" jsonb
);
--> statement-breakpoint
CREATE TABLE "export_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_date" date NOT NULL,
	"row_count" integer NOT NULL,
	"file_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_runs_run_date_unique" UNIQUE("run_date")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"enquiry_id" text NOT NULL,
	"kind" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" IN ('complaint','unsorted'))
);
--> statement-breakpoint
CREATE TABLE "reply_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enquiry_id" text NOT NULL,
	"body" text NOT NULL,
	"quote" jsonb,
	"provider" text NOT NULL,
	"model" text,
	"prompt_version" text NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "daily_rates" ADD CONSTRAINT "daily_rates_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_rates" ADD CONSTRAINT "daily_rates_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_rates" ADD CONSTRAINT "daily_rates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_photos" ADD CONSTRAINT "room_photos_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackout_dates" ADD CONSTRAINT "blackout_dates_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blackout_dates" ADD CONSTRAINT "blackout_dates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_nights" ADD CONSTRAINT "booking_nights_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_id_users_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_promo_id_promo_codes_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promo_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_events" ADD CONSTRAINT "enquiry_events_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_details" ADD CONSTRAINT "event_details_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_drafts" ADD CONSTRAINT "reply_drafts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_status_hold_idx" ON "bookings" USING btree ("status","hold_expires_at");--> statement-breakpoint
CREATE INDEX "bookings_guest_idx" ON "bookings" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "bookings_check_in_idx" ON "bookings" USING btree ("check_in");--> statement-breakpoint
CREATE INDEX "enquiries_lane_status_idx" ON "enquiries" USING btree ("lane","status");--> statement-breakpoint
CREATE INDEX "enquiries_owner_status_idx" ON "enquiries" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "enquiries_ai_status_idx" ON "enquiries" USING btree ("ai_status","ai_updated_at");