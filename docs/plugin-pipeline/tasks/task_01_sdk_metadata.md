# Task 01 — pkg/sdk MetadataSource capability client + adapter

> **Status: DONE (2026-07-31)** — pkg/sdk/metadata.go (+metadata_test.go) + doc.go; sdk 5->7; build/vet/test/lint/check.sh green; AC-3 (no proto edits), AC-2 (7<=12).

- **Type:** coder
- **Step:** 1 (dependency root — no coder deps)
- **Seams:** S9 (pkg/sdk↔go-plugin)
- **AC trace:** AC-2, AC-3
- **Project scope:** `.` (root; package `pkg/sdk`)
- **Deps:** none (generated `metadatav1` already committed)
- **Estimated LOC:** ~110 (S)

## behaviors

- **B1** `MetadataSource` interface exposes the four enrichment RPCs (`Match`/`BuildRequest`/`Convert`/`Merge`) over the generated `metadatav1` request/result messages. | ac: AC-2 | kind: normal
- **B2** `MetadataSourcePlugin.GRPCServer` registers `metadatav1.MetadataSourceServer`, adapting the author's `MetadataSource` impl to the generated unary service. | ac: AC-2 | kind: normal
- **B3** `MetadataSourcePlugin.GRPCClient` returns a value assignable to `sdk.MetadataSource` that wraps the generated `metadatav1.NewMetadataSourceClient` stub (the subprocess client impl). | ac: AC-2 | kind: normal
- **B4** `pkg/sdk` exported-symbol count rises 5->7 (`MetadataSource`, `MetadataSourcePlugin`); the package stays a shared LEAF importing only proto + go-plugin + grpc + stdlib. | ac: AC-2, AC-3 | kind: normal

## invariants

- **INV-sdk-leaf:** `pkg/sdk` imports ONLY proto (`metadatav1`/`scannerv1`/...), `hashicorp/go-plugin`, `google.golang.org/grpc`, and stdlib. It MUST NOT import any `internal/*` (external plugins import it; existing `pkg/sdk/doc.go:26-29` INV2).
- **INV-2impls (R8):** `MetadataSource` has >=2 implementations — the gRPC client wrapper built by `MetadataSourcePlugin.GRPCClient`, and an in-process test fake in `metadata_test.go`. Never single-impl.
- **INV-mirror:** The adapter MIRRORs `Scanner`/`ScannerPlugin` (`pkg/sdk/scanner.go:35-65`): `MetadataSourcePlugin` embeds `plugin.NetRPCUnsupportedPlugin` and holds `Impl MetadataSource`; `GRPCServer(broker, *grpc.Server)` + `GRPCClient(ctx, broker, *grpc.ClientConn) (interface{}, error)`. The MetadataSource RPCs are all **unary** (no streaming channel, unlike `Scanner.Scan`), so the adapter is simpler than `ScannerPlugin` (no channel pump).

## precondition

`pkg/sdk` ships 5 symbols and the dual-side `ScannerPlugin` pattern this task mirrors. The generated metadata gRPC bindings already exist and are committed.
- evidence: `pkg/sdk/doc.go:12-18` (5-symbol comment); `pkg/sdk/scanner.go:35-65` (`Scanner` interface + `ScannerPlugin` + `GRPCServer`/`GRPCClient` to mirror); `pkg/sdk/serve.go:45` (`Serve(...plugin.Plugin)` — adapter must satisfy `plugin.Plugin`).
- evidence: generated `proto/mellifera/metadata/v1/metadata_grpc.pb.go:31` (`MetadataSourceClient`), `:54` (`NewMetadataSourceClient`), `:101` (`MetadataSourceServer`), `:150` (`RegisterMetadataSourceServer`). The 4 service RPCs + all request/result messages are defined in `proto/mellifera/metadata/v1/metadata.proto:12-169`.

## postcondition

`pkg/sdk/metadata.go` defines `MetadataSource` (4-method interface) + `MetadataSourcePlugin` (dual-side adapter with `GRPCServer`/`GRPCClient`); a server-side adapter (`metadataServer`) and a client-side wrapper (`metadataGRPC`) live in the same file. `pkg/sdk/doc.go` updated to 7 symbols + INV1 names `MetadataSource` as the second justified interface. `pkg/sdk/metadata_test.go` round-trips the adapter (in-process fake — the R8 second impl) for all 4 RPCs. `check.sh` passes (7 <= 12; co-located test per new symbol).

## test_seed

Mirror `scanner_test` shape: a table test per new exported symbol (`MetadataSource` exercised via a fake impl; `MetadataSourcePlugin` exercised by asserting `GRPCClient` returns a `MetadataSource` and `GRPCServer` registers the service). The fake impl is the R8 second implementation.

## callers_to_update

- `pkg/sdk/doc.go` — the `# Public API (5 symbols)` comment block (`doc.go:12-18`) and INV1 (`doc.go:21-26`) MUST be updated to 7 symbols and name `MetadataSource`/`MetadataSourcePlugin` as the second capability (with its own >=2-impl R8 justification).

## allowed_imports

- `context` (stdlib)
- `github.com/hashicorp/go-plugin`
- `google.golang.org/grpc`
- `github.com/mellifera/mellifera/proto/mellifera/metadata/v1` (alias `metadatav1`)

## allowed_categories

- `stdlib`

## test_exclusions

- None material. The interface + dual-side adapter ARE the logic and are covered by the round-trip table test. (Adapter method forwards are exercised end-to-end via the fake; do NOT add a per-forwarder no-op test.)

## negative_examples

- DO NOT import any `internal/*` (INV-sdk-leaf; breaks external plugin authors).
- DO NOT invent a generic `Call`/reflect/`protobuf.Any` accessor (`internal/plugin/doc.go:14-19` forbids; this is a typed per-capability adapter).
- DO NOT add a streaming channel to `MetadataSource` — all 4 RPCs are unary (unlike `Scanner.Scan`).
- DO NOT edit any `.proto` (AC-3; additive-only). `metadatav1` is consumed, not authored.

## existing_code_snapshot

The pattern to mirror (`pkg/sdk/scanner.go:35-65`), verbatim shape:
```go
type Scanner interface {
	Scan(ctx context.Context, req *scannerv1.ScanRequest) (<-chan *scannerv1.DiscoveredFile, error)
	Identify(ctx context.Context, req *scannerv1.IdentifyRequest) (*scannerv1.IdentifyResult, error)
}
type ScannerPlugin struct {
	plugin.NetRPCUnsupportedPlugin
	Impl Scanner
}
func (p *ScannerPlugin) GRPCServer(_ *plugin.GRPCBroker, s *grpc.Server) error {
	scannerv1.RegisterScannerServer(s, &scannerServer{Impl: p.Impl})
	return nil
}
func (p *ScannerPlugin) GRPCClient(_ context.Context, _ *plugin.GRPCBroker, cc *grpc.ClientConn) (interface{}, error) {
	return &scannerGRPC{stub: scannerv1.NewScannerClient(cc)}, nil
}
```
`MetadataSourcePlugin` mirrors this; the server adapter forwards 4 unary methods (no channel pump), the client wraps `metadatav1.NewMetadataSourceClient(cc)`.

## contract_test_scope

- **joint:** `pkg/sdk MetadataSource -> internal/plugin (Task 02 consumer)` | assert: `MetadataSourcePlugin.GRPCClient` returns a value assignable to `sdk.MetadataSource`; the 4 method signatures are wire-compatible with `metadatav1.MetadataSourceClient`. (Re-asserted in Task 02 `manager_test.go` accessor + this task's round-trip.)

## scope_boundary

- CREATE `pkg/sdk/metadata.go`
- CREATE `pkg/sdk/metadata_test.go`
- MODIFY `pkg/sdk/doc.go` (symbol-count comment + INV1 doc ONLY)

## out_of_scope

- `internal/plugin/manager.go` (typed accessor = Task 02)
- `internal/enrich` (orchestrator = Task 05)
- `plugins/tv-parser` (first real consumer = Task 06)
- any `.proto` (additive-only; AC-3)
- `pkg/sdk/scanner.go`, `pkg/sdk/serve.go` (UNTOUCHED — mirror source, not a target)

## line_budget

150 (flex 1.3 — the server+client adapters are mechanical but verbose across 4 RPCs)

## acceptance_criteria

- AC-2 (build gates: 7 symbols <= 12; co-located test)
- AC-3 (additive: `scanner.go`/`serve.go`/`scanner.v1` UNCHANGED — `metadata.go` is a new additive file)

## refactoring_checklist

- `grep -c '^func ' pkg/sdk/metadata.go` >= 8 (4 server forwards + 4 client forwards + constructors) and the file compiles.
- `cd mellifera && go build ./pkg/sdk/... && go test ./pkg/sdk/...` green.
- `./.claude/skills/mellifera-build/scripts/check.sh` reports OK with pkg/sdk at 7 symbols.
- `git diff --stat 7bcc6c9 -- proto/` empty (no proto edits).

## skill_hint

`mellifera-build`, `golang-security`, `grounding`, `contracts`, `stack-patterns`
