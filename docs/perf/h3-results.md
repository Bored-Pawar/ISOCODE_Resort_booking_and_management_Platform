# H3 performance results

Measured with `scripts/perf-h3.mjs` against `pnpm build && pnpm start` on this PC (development Neon database), Lighthouse 13.6.0, mobile form factor, **simulated Slow 4G** (150 ms RTT, 1.6 Mbps, 4x CPU), median LCP of 3 runs per page. JS is the gzip (level 9) size of every `<script src>` in the page HTML except the `noModule` polyfill; it was identical before and after. Raw: [`raw-before.json`](raw-before.json) (finished 2026-11-09T00:55 UTC, main at the start of Phase 4) and [`raw-after.json`](raw-after.json) (finished 2026-11-09T01:19 UTC, exactly the committed Phase 4 code).

Budget (`02` Performance): each page adds at most 30 KB of its own JS above the framework baseline (about 120 KB for React and Next; 143 KB including the root layout, the `/_not-found` figure in `tdd-notes.md`), and LCP under 2.5 s.

| Page | JS (KB) | Own JS over 143 KB | LCP before (ms) | LCP after (ms) | LCP element (after) | TBT runs before (ms) | TBT runs after (ms) | CLS runs after |
|---|---|---|---|---|---|---|---|---|
| home | 162.6 | 19.6 (ok) | 3126 | 3210 (over) | hero image | 27/1633/1768 | 1582/33/37 | 0/0/0 |
| rooms-search | 169.3 | 26.3 (ok) | 3221 | 3225 (over) | first room card image | 25/24/24 | 24/34/29 | 0/0/0 |
| room-detail | 165.3 | 22.3 (ok) | 2896 | 3062 (over) | first gallery photo | 1840/1632/25 | 26/1738/29 | 0/0/0 |
| book-details | 162.7 | 19.7 (ok) | 2964 | 2961 (over) | summary text paragraph | 27/56/34 | 51/53/49 | 0.065/0.065/0.065 |
| enquire | 156.3 | 13.3 (ok) | 760 | 762 (ok) | intro text paragraph | 48/52/48 | 53/24/27 | 0/0/0.199 |

`/book/details` is measured signed in as the seeded guest with a real cart (quote hash); `/rooms` with a search (two adults, three weeks out).

## What changed
- Hero (`/`) and the first gallery photo (room page) get `fetchPriority="high"`: in Next 16 `priority` only preloads; it does not set fetch priority.
- Hero served at quality 60 (`images.qualities: [60, 75]`): about 49 KB to 40 KB at the 750w mobile size, under a dark gradient, no visible loss.
- Tried and reverted (no gain within noise): not preloading Fraunces; dropping the hero blur placeholder.
- Already in place before this phase: `next/image` everywhere with `sizes`, AVIF/WebP, blur placeholders, below-the-fold images lazy, server-rendered room pages, no client data fetching.

## Result and why LCP is still over 2.5 s
- **JS: every page is within budget** (own JS 13 to 26 KB).
- **LCP: `/enquire` is 0.8 s. The other four measure about 3.0 to 3.2 s, over the 2.5 s target.** The changes above did not move LCP beyond run-to-run noise (about ±0.2 s). Lighthouse's own estimate of what is left: unused JS 27 KB (framework chunks), legacy JS 14 KB, render-blocking CSS about 130 ms (FCP only), image delivery (mostly below-the-fold photos at low priority).
- Under simulated Slow 4G the LCP element shares 1.6 Mbps with about 160 KB of JS every page loads (React DOM and the Next client are about 119 KB of it). On `/book/details` the LCP element is text, yet it lands at about 3 s too, which points at the shared JS and the streamed server render rather than the images. Getting under 2.5 s needs less framework JS before first render or a smaller first image on mobile; both are bigger than this phase allows.
- `/book/details` has a steady CLS of 0.065 in all runs (under the 0.1 "good" threshold).
- **Variance on this PC is large.** In each batch one or two runs in three on `/` and the room page show a single 1.6 to 1.8 s "Unattributable" main-thread task (TBT); the other runs of the same build show 25 to 60 ms. `/enquire` showed a CLS of 0.199 in one run of this batch and of an earlier one, and 0 otherwise. Neither follows any code change; the PC had about 1 GB of free memory with Chrome, VS Code and other worktrees open. Recorded as environment noise; re-measure on the deployed site.

## Server time
The local server talks to Neon over the public internet from India; time to first byte on dynamic pages is dominated by database round trips (150 to 250 ms each from this PC). **The real fix is deploy region matching**: Vercel functions in the Neon project's region (Phase 7 pins it in `vercel.json`) bring each query down to a few milliseconds. Lighthouse here measures a local server, so this does not show above.

## Not done (bigger than this phase)
- A smaller mobile hero crop (art direction) to cut the first image under 25 KB.
- Trimming the shared root-layout client code (toast provider, icons), about 24 KB.
- Real-device and field (CrUX) numbers after deploy.
- The first room card image on `/rooms` has `alt=""`; checked in Phase 5 (accessibility).
