# Coder per-task summaries (one line per changed file)

## T06 — internal/plugin (subprocess lifecycle + gRPC clients)
- mellifera/internal/plugin/doc.go — package doc; 9-symbol API (Manager/Deps/Health + Open/Load/Start/Stop/Status/Scanner); INV1-5.
- mellifera/internal/plugin/manager.go — Manager/Deps/Health types, Open/Load/Scanner, unexported pluginEntry/runningPlugin/launchFunc + state/timing constants.
- mellifera/internal/plugin/lifecycle.go — Start/Stop/Status, doLaunch (launch+domain Handshake), monitor (poll Client.Exited), handleExit (§7.3 restart loop: backoff->3 fails->failed), defaultLaunch (real go-plugin), dispense, exponentialBackoff.
- mellifera/internal/plugin/manager_test.go — TestOpen, TestLoad (table), TestScanner_AccessorErrors (table), TestManager_RoundTrip (REAL go-plugin subprocess seam S5), TestManager_RestartFailedAfterThree (B7), TestExponentialBackoff.
- mellifera/internal/plugin/testdata/fakeplugin/main.go — test-only go-plugin subprocess: sdk.ScannerPlugin (scanner cap) + inline pluginSvcPlugin (domain pluginv1.Plugin service).
- mellifera/docs/scan-library/tasks/task_06_internal_plugin.md — T06 [x].
- mellifera/docs/scan-library/task_index.md — T06 done.
- mellifera/docs/scan-library/state.json — completed_count=6, next=T07, phase_log +T06.

## T08 — plugins/base-scanner (scanner binary, package main)
- mellifera/plugins/base-scanner/doc.go — package main doc; responsibility + invariants (path-guard AC-4, arg-slice, soft-fail AC-6, Cyrillic, separate-process); 0 exports.
- mellifera/plugins/base-scanner/main.go — ~20-line entrypoint; cookie+identity consts; sdk.Serve(ScannerPlugin + pluginSvcPlugin).
- mellifera/plugins/base-scanner/scanner.go — scannerImpl satisfies sdk.Scanner (Scan=resolveRoot+walk; Identify=parseTV); var _ sdk.Scanner compile-time guard.
- mellifera/plugins/base-scanner/walk.go — filepath.WalkDir (non-following) + media-ext filter + withinRoot guard + toDiscovered (fileID=sha256(rel)[:16]); bounded chan 16.
- mellifera/plugins/base-scanner/pathguard.go — withinRoot TOCTOU-closing (pre+post EvalSymlinks); isUnder via filepath.Rel (AC-4).
- mellifera/plugins/base-scanner/ffprobe.go — probe: exec.CommandContext arg-SLICE only; 30s per-file ctx; LookPath+json.Valid; SOFT-FAIL on miss/non-zero/non-JSON/timeout (AC-6).
- mellifera/plugins/base-scanner/tvparse.go — parseTV PURE: SxxExx + multi-episode + cleanTitle + resolution/release_group/year; Cyrillic-safe; structpb.NewStruct.
- mellifera/plugins/base-scanner/pluginsvc.go — CRITICAL: pluginSvcPlugin registers pluginv1.PluginServer; pluginServiceImpl Handshake/Health/Shutdown (served alongside scanner.v1).
- mellifera/plugins/base-scanner/helpers_test.go — makeMedia (ffmpeg lavfi fixture); strField/numField.
- mellifera/plugins/base-scanner/pathguard_test.go — TestWithinRoot (AC-4 table: symlink-out/dotdot/absolute/nested-chain/nonexistent + true cases).
- mellifera/plugins/base-scanner/tvparse_test.go — TestParseTV (table: SxxExx/multi-ep/Cyrillic/resolution/group/no-season/fallback).
- mellifera/plugins/base-scanner/ffprobe_test.go — TestProbe_SoftFail (missing+nonexistent+dir) + TestProbe_RealFFprobe (fixture JSON).
- mellifera/plugins/base-scanner/scanner_test.go — TestScan_EndToEnd (AC-1/4/6 integration) + TestScan_EmptyRoot.
- mellifera/plugins/base-scanner/smoke_test.go — TestBaseScannerSubprocess (B8: build+go-plugin launch+plugin.v1 Handshake+Scan+Identify+Shutdown; SKIP if ffprobe absent).
- mellifera/docs/scan-library/tasks/task_08_plugins_base_scanner.md — T08 [x].
- mellifera/docs/scan-library/task_index.md — T08 done.
- mellifera/docs/scan-library/state.json — completed_count=8, next=T09, phase_log +T08.
