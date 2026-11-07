# S1 parallel-work note for Claude Code

The S0 Codex review is deliberately left unchanged: historical evidence. The subsequent Claude fixes R01–R05 are documented in the S0 follow-up and must be present in our agreed base commit.

**Codex is exclusive owner for S1 B1–B5** of `src/db/**`, `src/modules/pricing/**`, `src/modules/inventory/**`, `src/modules/booking/**` and `src/modules/payments/**`. This includes seed pricing under `src/db/seed/**`. Do **not** change any of these paths, their frozen contracts, or Codex's B4 cron implementation. Codex implements B5 booking/payment confirmation, **not** B7's mock payment gateway.

**Claude Code is exclusive owner for G1–G3**: guest home/search, available-room listing, room detail, and `src/modules/catalog/**`, plus guest-screen-local components under its worktree. Use existing `catalog` public API, `pricing.quote()` and `inventory.availability()` public signatures. Build using the fixed coherent fixtures, then recheck with real B1/B2 service behavior after merge. Do not hard-code fixture IDs; real DB IDs are UUIDs.

Both developers start from **the same agreed base SHA**, different branches/worktrees. Confirm ownership in chat before editing. Coordinate first if an edit would touch `src/components/ui/**`, shared auth/lib, cross-feature routes, CI or the other's docs. Do not start B6/B7, A1/A2 or separate core module edits without fresh scope assignment.

Keep guest UI performant and responsive per `05-design-system.md`, with validation, loading/empty/error and sold-out/over-occupancy states. No dead buttons. Commit G1–G3 separately; report screenshots and tests. Do not merge into main without review and green checks.

**Review and next work:** Codex reviews G1–G3. Claude Code (Opus) reviews Codex B1–B5, including the early B1+B2 PR. After G1–G3 Claude takes Q1–Q3; R1–R2 remain unassigned until whichever developer finishes first is explicitly assigned. B1+B2 should merge early when independently reviewed and green, then Claude can switch from fixtures to real services. Each agent edits only its own rows in `06-progress.md`, or sends the update to the scrum master for application on `main`.
