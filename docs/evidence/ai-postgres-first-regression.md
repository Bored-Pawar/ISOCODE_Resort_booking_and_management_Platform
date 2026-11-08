# First broad PostgreSQL regression (2026-11-08)

Command: `pnpm test:integration`, after guarded read-only isolation preflight.

Actual outcome: 60 passed, 15 failed, 9 skipped; 9 files, 1593.55 seconds. This is a failed run, not a green gate.

Five booking assertions failed with `Overlapping GST slabs for 2099-11-14: 750000`. Six multi-room cases failed in 10-second fixture hooks; one additional multi-room case returned `NO_RATE` after those fixture timeouts. Pricing (6 cases) and booking-list (3 cases) were skipped after 10-second beforeAll timeouts. Two queue cases and one schema case exceeded the original test/hook budgets. The existing booking, inventory, pricing, schema, catalog and regression sources have no diff from base `e1e3d92`; pricing dependencies were not upgraded.

A subsequent guarded read-only query found no remaining duplicate GST schedule rows. No manual data deletion/reset/migration was performed to hide the failure. New AI test hooks now have explicit remote-database time budgets; an optional serial `vitest.postgres.config.mts` profile provides longer test/hook budgets without modifying the existing CI profile. Focused AI and affected regression reruns are recorded separately in the final handoff.

Final follow-up: all 21 focused AI cases passed (244.55 s); all 24 affected existing cases passed with unchanged assertions (566.12 s). The latter filter intentionally deselected 27 other cases, previously covered by the broad run. The first run remains a failed run in this evidence; successful reruns resolve its affected cases without rewriting that history.
