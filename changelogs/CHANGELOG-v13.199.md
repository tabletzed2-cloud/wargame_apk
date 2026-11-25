# v13.199 — tactical vehicle movement and sector layering

- Excluded vehicles from towed AT-gun crew classification. Landsverk 183 and CL/39 mounted cannons use the shared `at_gun` weapon type with two assigned gunners; the infantry minimum-three-crew rule incorrectly made every movement step impassable. Their normal vehicle terrain/AP rules now apply, without weakening actual immobilization or towed-gun restrictions.
- Prevented vehicle crews from receiving infantry AT-gun origin markers or entering the infantry gun-abandonment/detachment flow.
- Moved selected-vehicle fire sectors out of the per-hex drawing loop into a post-map overlay after terrain, relief and movement highlights. Sector origins still use the actual icon positions for stacked units, and both map and squad-panel selection remain supported.
- Added regression coverage for all eight affected templates, reachable routes, real immobilization, towed-gun crew/uphill restrictions, stacked-unit sector origins and render order. Updated the legacy sector-selection test for the overlay implementation.
- Added a real-browser test for selection, actual map movement and AP spending for all eight vehicles, plus pixel checks that sectors remain visible on cells both above and below their origin.
- Bumped app, offline-cache, manifest and module build markers to v13.199 so cached clients receive the fixes.

## Validation

- `node 'test_harness /checkhtml.js'`
- `python3 'tools /verify_build.py'`
- `node 'test_harness /regression_vehicle_mobility_sectors.cjs'`
- `node 'test_harness /regression_tactical_user_report_fixes.js'` (25 checks)
- `node 'test_harness /regression_arena_playtest_vehicle_fixes.cjs'`
- `node 'test_harness /regression_v13115_vehicle_sectors.js'`
- `node 'test_harness /regression_v13116_vehicle_artillery_button.js'`
- `node 'test_harness /regression_v13197_vehicle_fire_controls.cjs'`
- `node 'test_harness /regression_v13198_screen_and_vehicle_mg.cjs'`
- `node 'test_harness /browser_vehicle_mobility_sectors.cjs'` with `playwright-core`, `@sparticuz/chromium`, and the required Chromium shared libraries available.
