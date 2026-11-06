# 00 Requirements (PS3, Company A)

Source: client problem statement and benchmark brief. Use only this information. Every assumption is labelled **[A]**.

## Client
Coffee estate resort in Chikkamagaluru, Karnataka. 64 rooms + 12 villas (76 keys), lawns for weddings and offsites. 140 staff. Run by a GM; the owner signs the deal.

Today: 68% of room nights via OTAs at 18 to 22% commission, 12% direct. Website is a brochure. Enquiries arrive by email, phone, social, and the GM's WhatsApp. Rates live in Excel.

## Core build (must work end to end, 6 to 8 screens)
1. Room pages with photos, availability and price (with GST)
2. Booking flow, max 3 steps, test payment, confirmation
3. Admin: daily rates, website allotment, blackout dates, promo codes (simple)
4. Enquiry inbox: web form, forwarded email, WhatsApp (simulated)
5. AI router: classify (room, wedding, offsite, complaint), extract dates/guests/budget, assign owner, draft reply

Roles: guest, reservations staff, plus GM view (unsorted lane, complaint alerts).
Hard part: allotment control. The site never overbooks.
Mock payments, messages and outside systems. Seed from sample data.

## Optional depth (only after core is done)
Structured wedding/event form, daily booking export for the reservation system.

## AI rules (non negotiable)
1. Low confidence or failed classification goes to the unsorted lane the GM sees.
2. Staff re route in one click.
3. Drafts are never sent automatically.
4. Prices in drafts come from the rate table, never from the AI.
5. Complaints always alert the GM.

## Constraints
1. Site sells only the admin set allotment.
2. No passport details online (Form C at check in).
3. Guest data is personal data under DPDP Act 2023: consent, minimal data.
4. Fast on slow hill station networks.
5. GST at the rate for the tariff.
6. Minimal design: white space, restrained palette, clear type, large photos.

## Out of scope
Replacing the reservation system or channel manager, loyalty programme, restaurant bookings.

## Success metrics (client)
Direct share 12% to 20% in 12 months; median first reply under 30 min in working hours; zero website overbookings.

## Sample enquiries (from brief)
| ID | Message | Category |
|---|---|---|
| ENQ-4410 | Venue for my sister's wedding in Feb 2027, about 250 guests, 2 nights | Wedding |
| ENQ-4411 | Is a villa free 14-16 Nov for 2 adults and a child? | Room booking |
| ENQ-4412 | Team of 45 wants a January offsite with a conference hall | Corporate offsite |

## Deliverables
1. ZIP with TDD (GitHub URL + live link at top) and `deployment.md`.
2. Public repo with real commit history. No secrets, no real personal data.
3. Must have: working flows on realistic seed data, no dead buttons, auth with roles, working AI with failure handling, polished responsive UI with loading/empty/error states, tests for key logic, validated inputs, access control.

## Assumptions log
| ID | Assumption |
|---|---|
| A1 | Inventory is sold by room type, not physical room number; the PMS assigns rooms. |
| A2 | GST slab is chosen per night on the room value after discount. Slabs are configurable (verify current rates before seeding). |
| A3 | Hold time is 10 minutes. |
| A4 | One room per booking in the MVP. Larger groups are routed to an enquiry. |
| A5 | Guests sign in with email and password, created inline in booking step 2. |
| A6 | Room type names, photos and rates are invented for the demo. |
| A7 | The brand is shown as "Company A" and is configurable. |
| A8 | Photos are generated or free stock placeholders, not the real property. |
| A9 | Room types: Plantation Room 40, Estate Suite 24, Garden Villa 8, Pool Villa 4 (76 keys). |
