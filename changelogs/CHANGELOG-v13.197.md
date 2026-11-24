# v13.197 — per-weapon armored vehicle fire controls

- Replaced the legacy vehicle artillery action with an individual fire action for each mounted gun and machine gun.
- Disable weapon actions when their crew is unavailable, ammunition is empty, or the weapon has exhausted its fire limit; targeting respects each weapon's firing sector.
- Shared coaxial machine-gun crew indices with the vehicle's main gun crew; removed crew-collapse controls and prevented armored-crew reinforcement.
- Removed duplicate vehicle ammunition readouts and synchronized build/cache markers.
- Added regression coverage for Landsverk and CL/39 movement, weapon controls, crew sharing, and card ammunition display.
