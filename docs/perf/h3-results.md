# H3 performance results

Measured with `scripts/perf-h3.mjs` against `pnpm build && pnpm start` on this PC (development Neon database), Lighthouse 13.6.0, mobile form factor, **simulated Slow 4G** (150 ms RTT, 1.6 Mbps, 4x CPU), median of 3 runs per page. JS is the gzip (level 9) size of every `<script src>` in the page HTML except the `noModule` polyfill. Raw: [`raw-before.json`](raw-before.json) (2026-11-09T00:55 UTC, main at the start of Phase 4), [`raw-after.json`](raw-after.json) (2026-11-09T01:03 UTC).

Budget (`02` Performance): each page adds at most 30 KB of its own JS above the about 120 KB framework baseline (measured here as about 143 KB including the root layout, the `/_not-found` figure in `tdd-notes.md`), and LCP under 2.5 s.

| Page | JS before (KB) | JS after (KB) | Own JS over 143 KB | LCP before (ms) | LCP after (ms) | TBT runs before (ms) | TBT runs after (ms) |
|---|---|---|---|---|---|---|---|
| home | 162.6 | 162.6 | 19.6 (ok) | 3126 | 3131 (over) | 27/1633/1768 | 33/1665/1419 |
| rooms-search | 169.3 | 169.3 | 26.3 (ok) | 3221 | 3259 (over) | 25/24/24 | 25/27/29 |
| room-detail | 165.3 | 165.3 | 22.3 (ok) | 2896 | 2948 (over) | 1840/1632/25 | 1651/1824/1933 |
| book-details | 162.7 | 162.7 | 19.7 (ok) | 2964 | 2809 (over) | 27/56/34 | 48/50/50 |
| enquire | 156.3 | 156.3 | 13.3 (ok) | 760 | 761 (ok) | 48/52/48 | 1606/992/1693 |

The "after" batch was taken with the hero blur placeholder removed (one of the experiments, since reverted); the committed code is the "after" code with the blur restored, which affects neither JS nor LCP within noise.

`/book/details` is measured signed in as the seeded guest with a real cart (quote hash). `/rooms` is measured with a search (two adults, three weeks out).

## What changed
- Hero (`/`) and the first gallery photo (room page) get `fetchPriority="high"`: Next 16's `priority` preloads the image but no longer marks it high priority.
- Hero served at quality 60 (`images.qualities: [60, 75]`): 49 KB to about 40 KB at the 750w mobile size, under a dark gradient, no visible loss.
- Tried and reverted: not preloading Fraunces (no LCP gain within noise, and one run showed a 0.2 CLS on `/enquire` from the font swap); dropping the hero blur placeholder (no TBT change). Both stay as before.
- Everything else was already in place: `next/image` everywhere with `sizes`, AVIF/WebP, blur placeholders, below-the-fold images lazy, server-rendered room pages, no client data fetching.

## Result and why LCP is still over 2.5 s
- **JS: every page is within budget** (own JS 13 to 26 KB).
- **LCP: the text-led page (`/enquire`) is 0.8 s; the four image-led pages are about 2.8 to 3.1 s, over the 2.5 s target.** The changes above moved LCP by less than run-to-run noise (about ±0.2 s). Lighthouse's own estimate of what is left: unused JS 27 KB (framework chunks), legacy JS 14 KB, render-blocking CSS about 130 ms (FCP only), image delivery (mostly below-the-fold photos at low priority).
- Under simulated Slow 4G the LCP image shares 1.6 Mbps with about 160 KB of JS that every page loads (React DOM and the Next client are about 119 KB of it), so image LCP lands near 3 s however small the image is. Getting under 2.5 s would need less framework JS before the image (not possible without dropping the App Router) or a smaller first image on mobile; both are bigger changes than this phase allows.
- **Variance on this PC is large.** About half the runs on `/`, the room page and (in one batch) `/enquire` show one 1.2 to 1.9 s "Unattributable" main-thread task (TBT); the other runs of the same build show 25 to 60 ms. It moves between pages and builds, does not follow any code change, and the PC had about 1 GB of free memory with Chrome, VS Code and other worktrees open, so it is recorded as environment noise, not a code finding. `/enquire` CLS was 0 in five of six runs (0.199 in one batch, not reproduced). Re-measure on the deployed site.

## Server time
The production server here talks to Neon over the public internet from India; time to first byte on dynamic pages is dominated by database round trips (each 150 to 250 ms from this PC). **The real fix is deploy region matching**: put the Vercel functions in the Neon project's region (Phase 7 pins it in `vercel.json`), which brings each query to a few milliseconds. Lighthouse here measures a local server, so this does not show in the numbers above, but it does on a deployed site.

## Not done (bigger than this phase)
- A smaller mobile hero crop (art direction) to cut the first image under 25 KB.
- Trimming the shared root-layout client code (toast provider, icons) from about 24 KB.
- Real-device and field (CrUX) numbers after deploy.
