# 05 Design System

Direction: **"Quiet estate."** Calm, warm, editorial. Photos do the selling; the interface stays out of the way. Think a printed hotel brochure, not a booking engine.

## Principles
1. Every element earns its place. If it has no job, remove it.
2. One accent colour, used only for the primary action on a screen.
3. Large photos on the guest site; dense, calm tables on staff screens.
4. Booking is 3 steps, always visible as a step indicator.
5. Speed is design: nothing may break the budget in `02-architecture.md`.

## Brand placeholders [A7]
1. Name shown as **Company A** (wordmark in the display font), set in `src/lib/site.ts`, so it can be swapped.
2. Tagline: "A coffee estate in the hills of Chikkamagaluru."

## Colour tokens
CSS variables on `:root`, mapped into Tailwind theme. Light theme only for the MVP.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FAF8F4` | Page background (warm paper) |
| `--surface` | `#FFFFFF` | Cards, panels, inputs |
| `--surface-2` | `#F3EFE8` | Subtle fills, table header, hover |
| `--text` | `#1F1B16` | Body and headings (coffee black) |
| `--muted` | `#6B645A` | Secondary text, labels |
| `--border` | `#E4DED3` | Dividers, input borders |
| `--accent` | `#2F4A3A` | Primary buttons, links, focus ring (estate green) |
| `--accent-hover` | `#253B2E` | Primary hover |
| `--accent-soft` | `#E6EDE8` | Selected states, accent badges |
| `--coffee` | `#7A4E2D` | Rare highlight only (e.g. "Best value" tag) |
| `--success` | `#2E7D4F` | Confirmed, saved |
| `--warning` | `#A86A12` | Holds expiring, low confidence |
| `--danger` | `#B3261E` | Errors, complaints, sold out |

Text on `--accent` is `#FFFFFF`. Status colours always pair with an icon or word, never colour alone.

## Typography
1. **Display:** Fraunces (variable, latin subset, via `next/font/google`, which self hosts). Headings and prices on guest pages only.
2. **Body and UI:** system sans stack `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Zero download cost.
3. Numbers in tables and grids use `font-variant-numeric: tabular-nums`.

| Token | Size / line height | Use |
|---|---|---|
| `display` | 40/48 (28/36 on mobile) | Hero heading |
| `h1` | 28/36 | Page title |
| `h2` | 20/28 | Section title |
| `body` | 16/24 | Default |
| `small` | 14/20 | Labels, meta, staff tables |
| `xs` | 12/16 | Badges, captions |

Weights: 400 and 600 only. Headings in Fraunces 500.

## Layout and spacing
1. 4px base. Use 4, 8, 12, 16, 24, 32, 48, 64, 96.
2. Guest content max width 1120px; reading text max 640px.
3. Mobile gutter 16px, desktop 32px. No horizontal scroll at 375px.
4. Guest sections separated by 64px (mobile) / 96px (desktop).
5. Staff app: left sidebar 232px, content full width, tables dense (row height 44px).

## Shape and depth
1. Radius: 6px inputs and buttons, 10px cards, 0 on full bleed photos.
2. Borders over shadows. One shadow only, for popovers and modals: `0 8px 24px rgba(31,27,22,0.08)`.
3. Motion: 150ms ease-out for hover and fades. No parallax, no carousels that autoplay. Respect `prefers-reduced-motion`.

## Components (F7)
| Component | Notes |
|---|---|
| Button | `primary` (accent fill), `secondary` (border), `ghost`; sizes md 44px, sm 36px; loading state with inline spinner, text kept |
| Input, Select, DateRange, Stepper (guests) | Label above, help or error text below, 44px height |
| Card | Surface, border, 10px radius |
| Badge | Category, channel, status, confidence; soft fill + text colour |
| StepIndicator | "1 Room · 2 Details · 3 Pay", current step bold |
| PriceBlock | Total in Fraunces, then "incl. ₹x GST" in small muted; expandable per night breakdown |
| HoldTimer | "Held for you · 08:42"; turns `--warning` under 2 min |
| Skeleton | Matches final layout shape |
| EmptyState | Icon, one line, one action |
| ErrorState | What happened, Retry button |
| Toast | Bottom right desktop, bottom full width mobile |
| DataGrid | Sticky first column and header, tabular numbers, inline cell edit |

Icons: `lucide-react`, 18px, stroke 1.5.

## Screens (wireframe level)

**1. Home and search (guest)**
Full bleed hero photo (mist over estate), heading and tagline bottom left over a soft dark gradient. A search bar card overlaps the bottom of the hero: dates, guests, "Check availability". Below: 3 short story blocks (estate, rooms, events) with one photo each, then room highlights, then a quiet band "Planning a wedding or offsite? Send an enquiry". Footer with address and contact.

**2. Rooms list (guest)**
Search summary bar at top (dates, guests, edit). One card per room type: large photo left (top on mobile), name, 1 line description, occupancy icons, total for the stay incl. GST, "View room". Sold out cards greyed with "Not available for these dates". Too many guests shows "Booking for a group? Send an enquiry".

**3. Room detail (guest)**
Photo gallery (1 large + 2 small on desktop, swipe on mobile). Left: description, amenities grid, policies. Right (bottom sheet on mobile): sticky booking card with dates, guests, rate plans as radio cards (EP / CP / MAP with inclusions), PriceBlock, "Reserve" button.

**4. Booking steps (guest)**
Two column on desktop: form left, sticky summary right (photo thumb, dates, plan, PriceBlock, HoldTimer). Mobile: summary collapsed at top. Step 2: name, email, phone, password (create account), DPDP consent checkbox with plain language notice. Step 3: mock payment card with "Pay ₹x (test mode)" and clear test mode label.

**5. Confirmation (guest)**
Calm success: check icon, "Your stay is confirmed", booking ref large, stay summary, price breakdown, check-in note, "Add to calendar" (ics), "Back to home".

**6. Rates and allotment (staff)**
Tabs: Rates, Allotment. Toolbar: room type filter, date range (30 days), "Bulk edit". DataGrid: rows are room types (and plans for rates), columns are dates, weekends shaded. Allotment cells show `allotment` large with `sold / held` small beneath; cells below committed are impossible to save and explain why.

**7. Enquiry inbox (staff)**
Three panes on desktop: lanes and filters (left), list (middle: sender, one line summary, badges for category, channel, confidence, time waiting), detail (right: raw message, extracted fields, draft editor with Approve and send, re-route dropdown, timeline). Unsorted lane and complaints carry a count badge.

**8. Staff login and guest login**
Centred card on `--bg`, wordmark above, one photo on the side on desktop.

## Imagery
1. Style: natural light, misty mornings, coffee greens, warm wood, unstaged. No people facing the camera. No text in images.
2. Source: generated (option B below) is preferred, consistent and clearly fictional. Stock from Unsplash or Pexels (free licence) is the fallback. Either way the TDD notes the photos are placeholders.
3. Files: `public/images/<name>.jpg`, 2000px wide, quality 80. `next/image` serves AVIF/WebP at the right size.
4. Aspect: hero 16:9 (cropped to 4:5 on mobile via `object-position`), room cards 4:3, gallery 3:2.

### Shot list
| File | Subject |
|---|---|
| `hero-estate.jpg` | Mist over coffee plantation hills at sunrise, a small cottage roof in the distance |
| `story-estate.jpg` | Close up of red coffee cherries on a branch |
| `story-rooms.jpg` | Wooden verandah with two chairs facing the plantation |
| `story-events.jpg` | Lawn set for an evening event with warm string lights, no people |
| `plantation-room-1/2/3.jpg` | Calm room, wooden floor, white linen, window to greenery; bathroom; balcony |
| `estate-suite-1/2/3.jpg` | Larger room with sitting area; bath with stone; view from bed |
| `garden-villa-1/2/3.jpg` | Villa exterior in a garden; living room; private sit-out |
| `pool-villa-1/2/3.jpg` | Villa with private plunge pool; bedroom; pool at dusk |
| `wedding-lawn.jpg` | Large lawn framed by trees, mandap style setup, no people |
| `conference-hall.jpg` | Bright hall with long tables and plantation view |
| `auth-side.jpg` | Coffee leaves with dew, tall crop |

### Generation prompt (option B, paste into image tool, change the subject each time)
"Photorealistic editorial travel photograph for a boutique coffee estate resort in the Western Ghats of Karnataka, India. Subject: <SUBJECT>. Soft natural morning light, light mist, muted warm greens and wood tones, calm and uncluttered, shot on a 35mm lens, no people facing camera, no text, no logos. Aspect ratio <RATIO>."

## Copy voice
Warm, short, plain. "Your room is held for 10 minutes." not "Hold acquired." Prices always "₹12,400 incl. ₹1,890 GST". Dates "Sat 14 Nov to Mon 16 Nov · 2 nights". Errors say what happened and what to do next.

## Every screen must have
Loading (skeletons on guest pages), empty with a next action, error with Retry, clear disabled states, no dead buttons.

## Accessibility
AA contrast (all token pairs above pass), visible 2px `--accent` focus ring, labels on every input, 44px tap targets, keyboard usable booking flow.
