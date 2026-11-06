# 03 Data Model

LOCKED AREA. One agent at a time. See Locks in `06-progress.md`.

Conventions: money is integer paise (`*_paise`). Dates are `DATE` in IST. Timestamps are `timestamptz`. IDs are `uuid` unless noted.

## Identity
**users**: id, email UNIQUE, password_hash, name, phone, role CHECK IN ('guest','reservations','sales','gm'), consent_at, consent_version, created_at

## Catalog and pricing
**room_types**: id, slug UNIQUE, name, description, total_units CHECK > 0, max_adults, max_children, amenities jsonb, sort

**room_photos**: id, room_type_id FK, url, alt, width, height, blur_data, sort

**rate_plans**: id, room_type_id FK, code CHECK IN ('EP','CP','MAP'), name, inclusions, refundable bool, active bool

**daily_rates**: PK(room_type_id, rate_plan_id, date), price_paise CHECK > 0, updated_by, updated_at

**tax_slabs**: id, min_paise, max_paise (null = no cap), gst_bp (basis points), effective_from

**promo_codes**: id, code UNIQUE, kind CHECK IN ('pct','flat'), value CHECK > 0, valid_from, valid_to, min_nights, max_uses, used_count CHECK >= 0, active

## Inventory
**inventory**: PK(room_type_id, date), allotment CHECK >= 0, sold CHECK >= 0, held CHECK >= 0, CHECK (sold + held <= allotment), updated_at

**blackout_dates**: id, room_type_id (null = all), start_date, end_date, reason, created_by, CHECK (end_date >= start_date)

## Booking
**bookings**: id, ref UNIQUE (e.g. CA-7K3P9), guest_id FK, room_type_id FK, rate_plan_id FK, check_in, check_out, units CHECK (units >= 1) (MVP validation enforces 1), adults, children, status CHECK IN ('HELD','CONFIRMED','EXPIRED','CANCELLED'), hold_expires_at, quote_hash, promo_id FK null, subtotal_paise, discount_paise, gst_paise, total_paise, created_at, confirmed_at, CHECK (check_out > check_in)
Index: (status, hold_expires_at), (guest_id), (check_in)

**booking_nights**: PK(booking_id, date), rate_paise, discount_paise, gst_bp, gst_paise

**payments**: id, booking_id FK, provider, provider_payment_id UNIQUE, amount_paise, status CHECK IN ('SUCCESS','FAILED','REFUND_PENDING'), created_at

**booking_events**: id, booking_id FK, from_status, to_status, actor, note, at

## Enquiries
**enquiries**: id text PK (ENQ-xxxx), channel CHECK IN ('web','email','whatsapp','event_form'), sender_name, sender_contact, raw_text, received_at, category CHECK IN ('room','wedding','offsite','complaint','other') null, confidence numeric(3,2), extracted jsonb, ai_status CHECK IN ('pending','processing','ok','fallback','failed'), ai_attempts int default 0, ai_last_error text null, ai_updated_at, lane CHECK IN ('sorted','unsorted'), owner_id FK null, status CHECK IN ('new','assigned','replied','closed'), is_complaint bool, first_reply_at
Index: (lane, status), (owner_id, status), (ai_status, ai_updated_at)

**event_details**: enquiry_id PK FK, event_type, date_from, date_to, guests, budget_paise, needs jsonb

**reply_drafts**: id, enquiry_id FK, body, quote jsonb (from pricing), provider, model, prompt_version, edited bool, approved_by FK null, sent_at

**enquiry_events**: id, enquiry_id FK, actor, action CHECK IN ('classified','rerouted','edited','sent','closed'), from_value, to_value, at

**notifications**: id, user_id FK, enquiry_id FK, kind CHECK IN ('complaint','unsorted'), read_at, created_at

## Export
**export_runs**: id, run_date UNIQUE, row_count, file_url, created_at

## Seed (realistic, invented)
1. Room types (A9): Plantation Room 40, Estate Suite 24, Garden Villa 8, Pool Villa 4. 3 photos each (file names in `05`). Website allotment seeded below total units (e.g. 40% of rooms) to leave agency stock.
2. Rates and inventory for 180 days, weekend and season variation.
3. 3 staff users (reservations, sales, gm) + 2 demo guests.
4. 30 bookings across states.
5. 30 labelled enquiries across channels and categories, including the 3 from the brief and tricky cases (mixed intent, Hinglish, vague dates, complaint).
