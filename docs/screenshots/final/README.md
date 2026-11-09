# Final screenshot set (S3 Phase 5, H4 and H5)

Taken 2026-11-09T03:43 UTC by `node scripts/ux-walk.mjs http://localhost:3300 --shots` against `pnpm build && DEV_TOOLS_ENABLED=true pnpm start` on the development database (synthetic seed data only). Full-page JPEGs named `<screen>-<desktop|mobile>.jpg`; desktop is 1280px wide, mobile 375px. Staff screens are prefixed with the role. A role without access to a screen (for example sales on Rates) shows the 403 screen ("Your role doesn't include this page"); that is the expected state and is captured as such. The confirmation screen is a CONFIRMED seed booking; the pay screen is one hold the script creates once (it expires on its own). Screenshots are taken before the focus probe. Raw results: [`walk.json`](walk.json), [`hydration.json`](hydration.json), [`keyboard.json`](keyboard.json).

## What was checked, automatically
72 screen checks (36 screens x 2 widths), **0 with findings** after the Phase 5 fixes. Each check:
- HTTP status and console errors;
- horizontal scroll at the width;
- axe-core 4.10, WCAG 2.1 A and AA, serious and critical (labels, names, contrast, roles);
- every internal page link fetched with the same session (API routes and downloads skipped): no dead links;
- a visible focus style on the first focusable element after one Tab (the global `:focus-visible` ring); this is not a full tab-order audit.

Also:
- **Hydration warnings** (`scripts/hydration-check.mjs`, `pnpm dev`, 16 pages signed out, as guest and as GM, each loaded twice): 0.
- **Keyboard, booking start** (`scripts/keyboard-check.mjs`, 375px): Tab to "Add room", Enter, Tab to "Continue", Enter reaches `/book/details`; focus stays on the button. Details, hold, pay and confirmation were **not** driven by keyboard.

## Fixed in this phase (the first walk found 26 checks with findings)
- Badge text on its own 10% tint failed AA: `--warning` `#A86A12` to `#8A560C`, `--success` `#2E7D4F` to `#276B43` (`05` updated). This was every contrast finding (bookings, promos, inbox, enquiry detail, account, pay, room cards).
- Home hero: the section has a dark base, so the white heading and tagline stay readable before (or without) the photo.
- Room photo strip on phones (several photos) is a horizontal scroller: now focusable, with an inset focus ring. On desktop (a grid, nothing to scroll) it is still one tab stop; left as is.

## Not verified
- Loading, empty and error states were not forced or captured; the screenshots show the loaded state with seed data. (Suspense skeletons, lane empty texts and inline action errors exist in the code from earlier sprints, but this phase did not look at them rendered.)
- No dead-button pass (only links were checked).
- Copy voice per `05`: only read on the screenshots, no systematic check.

## Screens
| Screen | Persona | Path | Page title | Images |
|---|---|---|---|---|
| home | signed-out | `/` | Company A | [desktop](home-desktop.jpg) · [375px](home-mobile.jpg) |
| rooms | signed-out | `/rooms` | Build your stay · Company A | [desktop](rooms-desktop.jpg) · [375px](rooms-mobile.jpg) |
| room-detail | signed-out | `/rooms/garden-villa` | Company A | [desktop](room-detail-desktop.jpg) · [375px](room-detail-mobile.jpg) |
| details-signup | signed-out | `/book/details?…` | Your details · Company A | [desktop](details-signup-desktop.jpg) · [375px](details-signup-mobile.jpg) |
| enquire | signed-out | `/enquire` | Send an enquiry · Company A | [desktop](enquire-desktop.jpg) · [375px](enquire-mobile.jpg) |
| login | signed-out | `/login` | Sign in · Company A | [desktop](login-desktop.jpg) · [375px](login-mobile.jpg) |
| signup | signed-out | `/signup` | Create account · Company A | [desktop](signup-desktop.jpg) · [375px](signup-mobile.jpg) |
| staff-login | signed-out | `/admin/login` | Staff sign in · Company A | [desktop](staff-login-desktop.jpg) · [375px](staff-login-mobile.jpg) |
| details | guest | `/book/details?…` | Your details · Company A | [desktop](details-desktop.jpg) · [375px](details-mobile.jpg) |
| account | guest | `/account` | My bookings · Company A | [desktop](account-desktop.jpg) · [375px](account-mobile.jpg) |
| confirmation | guest | `/booking/CA-UVZTJ` | Your booking · Company A | [desktop](confirmation-desktop.jpg) · [375px](confirmation-mobile.jpg) |
| pay | guest | `/book/pay/CA-U8DU5` | Pay · Company A | [desktop](pay-desktop.jpg) · [375px](pay-mobile.jpg) |
| reservations-overview | reservations | `/admin` | Overview · Company A | [desktop](reservations-overview-desktop.jpg) · [375px](reservations-overview-mobile.jpg) |
| reservations-rates | reservations | `/admin/rates` | Rates · Company A | [desktop](reservations-rates-desktop.jpg) · [375px](reservations-rates-mobile.jpg) |
| reservations-allotment | reservations | `/admin/allotment` | Allotment · Company A | [desktop](reservations-allotment-desktop.jpg) · [375px](reservations-allotment-mobile.jpg) |
| reservations-promos | reservations | `/admin/promos` | Promo codes · Company A | [desktop](reservations-promos-desktop.jpg) · [375px](reservations-promos-mobile.jpg) |
| reservations-bookings | reservations | `/admin/bookings` | Bookings · Company A | [desktop](reservations-bookings-desktop.jpg) · [375px](reservations-bookings-mobile.jpg) |
| reservations-inbox | reservations | `/admin/inbox` | Inbox · Company A | [desktop](reservations-inbox-desktop.jpg) · [375px](reservations-inbox-mobile.jpg) |
| reservations-enquiry-detail | reservations | `/admin/inbox/ENQ-MRN5Y` | Enquiry · Company A | [desktop](reservations-enquiry-detail-desktop.jpg) · [375px](reservations-enquiry-detail-mobile.jpg) |
| reservations-outbox | reservations | `/dev/outbox` | Outbox · Dev tools | [desktop](reservations-outbox-desktop.jpg) · [375px](reservations-outbox-mobile.jpg) |
| sales-overview | sales | `/admin` | Overview · Company A | [desktop](sales-overview-desktop.jpg) · [375px](sales-overview-mobile.jpg) |
| sales-rates | sales | `/admin/rates` | Rates · Company A | [desktop](sales-rates-desktop.jpg) · [375px](sales-rates-mobile.jpg) |
| sales-allotment | sales | `/admin/allotment` | Allotment · Company A | [desktop](sales-allotment-desktop.jpg) · [375px](sales-allotment-mobile.jpg) |
| sales-promos | sales | `/admin/promos` | Promo codes · Company A | [desktop](sales-promos-desktop.jpg) · [375px](sales-promos-mobile.jpg) |
| sales-bookings | sales | `/admin/bookings` | Bookings · Company A | [desktop](sales-bookings-desktop.jpg) · [375px](sales-bookings-mobile.jpg) |
| sales-inbox | sales | `/admin/inbox` | Inbox · Company A | [desktop](sales-inbox-desktop.jpg) · [375px](sales-inbox-mobile.jpg) |
| sales-enquiry-detail | sales | `/admin/inbox/ENQ-4412` | Enquiry · Company A | [desktop](sales-enquiry-detail-desktop.jpg) · [375px](sales-enquiry-detail-mobile.jpg) |
| sales-outbox | sales | `/dev/outbox` | Outbox · Dev tools | [desktop](sales-outbox-desktop.jpg) · [375px](sales-outbox-mobile.jpg) |
| gm-overview | gm | `/admin` | Overview · Company A | [desktop](gm-overview-desktop.jpg) · [375px](gm-overview-mobile.jpg) |
| gm-rates | gm | `/admin/rates` | Rates · Company A | [desktop](gm-rates-desktop.jpg) · [375px](gm-rates-mobile.jpg) |
| gm-allotment | gm | `/admin/allotment` | Allotment · Company A | [desktop](gm-allotment-desktop.jpg) · [375px](gm-allotment-mobile.jpg) |
| gm-promos | gm | `/admin/promos` | Promo codes · Company A | [desktop](gm-promos-desktop.jpg) · [375px](gm-promos-mobile.jpg) |
| gm-bookings | gm | `/admin/bookings` | Bookings · Company A | [desktop](gm-bookings-desktop.jpg) · [375px](gm-bookings-mobile.jpg) |
| gm-inbox | gm | `/admin/inbox` | Inbox · Company A | [desktop](gm-inbox-desktop.jpg) · [375px](gm-inbox-mobile.jpg) |
| gm-enquiry-detail | gm | `/admin/inbox/ENQ-4404` | Enquiry · Company A | [desktop](gm-enquiry-detail-desktop.jpg) · [375px](gm-enquiry-detail-mobile.jpg) |
| gm-outbox | gm | `/dev/outbox` | Outbox · Dev tools | [desktop](gm-outbox-desktop.jpg) · [375px](gm-outbox-mobile.jpg) |
