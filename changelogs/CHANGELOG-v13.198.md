# v13.198 — exclusive screens and model-based armored MG names

- Made menu, tactical battle, campaign, rules, and history top-level screens mutually exclusive; returning to the menu resets scroll and reloads that explicitly left the player in the menu instead of reopening the campaign.
- Renamed mounted BeVe/A.I.R.F. machine guns to “Пулемёт Schwarzlose танковый” and “Пулемёт Hotchkiss танковый”. Individual mount sectors and crew indices remain per installation in `crewInstances` metadata.
- Migrated old saved weapon names to the new display names while preserving their historic firing sectors; legacy weapon definitions remain available to old saves but are hidden from new crew assignment.
- Synchronized application, service-worker, manifest, and module build markers.
- Added regression coverage for exclusive screen transitions and legacy save migration.
