# tv-style-parity

Per-screen TV app parity with the deployed SPA per the ruled 2026-11-26 draft: type-scale modes, height-aware density contract, settings overlay, series episode grid, photo fit-over-blur tiles, player header, home anatomy, home resume refetch

Dispatch DAG: groups 16 → 17 → 18 strictly first (the knob exists before the screens re-tile, so every later group verifies in all three modes), then 19–22 in any order, 23 independent. Duties run targeted JVM tests only — the device walks are post-green, session-side over the tv-debug relays, never duties.
