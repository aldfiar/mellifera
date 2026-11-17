# Session handoff — android-tv-layout-parity (2026-11-17)

Worktree `mellifera.worktrees/android-tv-app`, branch `feature/android-tv-app` @ **b411028**, pushed to origin. Two commits: `9384625` feat(android-tv) — the 8.7–8.16 app work + rename pass (43 files, +1639/−472; creates PhotoViewer.kt, TypeScale.kt, BodyBackTest.kt, PhotoFlowTest.kt, TypeScaleTest.kt); `b411028` chore(openspec) — the register (walks 62/62b/62c/62d, ledger #19–#26). Worktree clean. **No PR — branch only; operator has not asked.**

## Closed this session

- **8.11 CLOSED + PROVEN (walk62c, 0.3.11-race-fix)** — #13 race fix: all THREE grid actuators re-armed on the shared `focusUntilAttached` idiom (60-frame retry, BrowseScreen.kt:780-792); rail-close actuator transition-gated (`railWasOpen` remember — its first-run at fresh composition fired on initial false, a latent #18-class steal); two-emit law untouched; JVM-pinned (`body_swap_emits_survive_a_busy_collector`). Proof: 5/5 deterministic landings, landing ≢ entry home (XML f7d72017/PNG b94107b2 vs entry 366b8767/77a035ce), NO-OP absent 0/10, old build split 2 LAND/2 NO-OP of 4, FOC tile0 [432,692][784,1080] = 1.1×320 exact, 3s≡8s byte-identical.
- **8.15 rider CLOSED** — fresh-entry OK on «Ария · S01E01» → minimal player tree, live video + AudioTrack STATE_ACTIVE (first exercised), position commit +33s proven.
- **8.16 CLOSED + PROVEN (walk62d, 0.3.12-type-scale)** — the «too large rows and text» report root-caused: box density 320 = 2.0×; text was authored 1:1 from SPA px → rendered double; geometry was already ÷2. Fix = `ui/TypeScale.kt` constants (META 6 / SMALL 7 / BODY 8 / HEADING 9 / READOUT 10 / DISPLAY 14 / CODE 24 sp = SPA px ÷ 2), zero raw sp left in main, rows/paddings halved (episode rows 144→72px pixel-proven), D11 floors RETIRED, tile/card/rail geometry byte-stable, focus 1.1 laws intact. Ink halving exact on all 8 classes (ratios 0.44–0.56).

## Laws in force (do not re-derive)

- **Walks run via SUBAGENTS** — the orchestrator never runs adb; capture and decode are SEPARATE agents; ONE device agent at a time. The tv-debug skill carries the law.
- **adb rides python TCP relays** (127.0.0.1:15001, PID 69232; box 192.168.0.215) — adb NEVER dials directly (VPN/proxy intercepts). Recipe: `.claude/skills/adb-local/`.
- **Decoder briefs must state: «no adb, no ssh, no transport, local files only»** — prod SSH (alatoic) was NEVER authorized by the user; the classifier denied decoder prod-SSH briefs twice. A denied permission is never worked around; agents cannot grant escalation.
- **PIXELS are the evidence class** — a11y XML bounds DEMOTED (quirk-ridden in both builds: walk62c 42px boxes over 30px ink; walk62d 1–2px boxes over 9px ink; episode-row views absorb the 12px gap).
- APK build: `ANDROID_HOME="$HOME/Library/Android/sdk" android/gradlew -p android assembleRelease -PversionName=<name> -PversionCode=$(date +%s)` → stage into `android/apk/` (gitignored). Suite: 191 green on 0.3.12.
- Box runs **0.3.12-type-scale** (sha 6bda03e6…).

## Operator queue (top first)

1. **#26 SERVER PROBE** — series-page episode rows render NO titles (9/9 Блич rows meta+✓ only, title-NULL layout ink-proven) = blank display_name on /series/{id}/episodes. SERVER-DATA state; TMDB-enrichment (deployed dormant 10 Nov) is the suspect; client mapping ruled out (0.3.9 served composed names on the same path 3.5h earlier). Probe: dump display_name for Блич on the server. Needs operator-named prod access or an operator-run command.
2. Ruling queue: #17 disambiguator; #23 three-path return (entry-resume → home+played card; anchor → base grid tile0; rail-OK body → series → BACK → bare body-top grid, lawful closeSeries intermediate); #14 BACK-exit; title-slot companion law; #19 re-offer; #20 commit-window check (commit happens between 14s and 33s of playback); #24 BACK discriminator + scroll design (b1_back doubles as a body-top-class datapoint); 8.14's answer.

## Remaining 6.1 legs

- 8.8 anchor-path leg (never pressed on-device); sub-4s transient caveat; tv-stills arm (no «ТВ» collection on this box). ~20 done-but-unticked boxes await the tick sweep (offered, not yet asked).

Next: operator rules on #26 probe access (or runs the display_name dump themselves); then the tick sweep, then 6.1 close → archive. PR opening remains the operator's call.
