- [x] Task 03 (coder): Implement pkg/sdk (plugin SDK — shared leaf)
  target: mellifera/pkg/sdk/doc.go, mellifera/pkg/sdk/serve.go, mellifera/pkg/sdk/scanner.go, mellifera/pkg/sdk/*_test.go | action: CREATE
  archetype: external-services
  skill_hint: stack-patterns
  feature_goal: (see T01)
  why: This is the thin SDK (D15/Q2) every plugin author calls. `Serve` encapsulates the go-plugin substrate (magic cookie, gRPC server, signal handling) so a plugin's `main.go` is ~20 lines. `ScannerPlugin` is the dual-side `GRPCPlugin` adapter. `Scanner` is THE one interface this feature ships — justified by ≥2 impls (R8). Tricky pure-Go piece (R1).
  data_flow: enters from: T02 generated `scannerv1.*`/`pluginv1.*` types → transforms: adapt channel-based `Scanner` to gRPC stream (server side) + wrap gRPC stub into `Scanner` (client side); validate magic cookie + serve gRPC → emits to: T06 plugin.Manager (client wrapper via ScannerPlugin.GRPCClient), T08 base-scanner (server side via Serve + ScannerPlugin.GRPCServer).
  related: producer T02 (proto types); consumers T06, T08; seams S3 (Scanner interface), S5 (ScannerPlugin dual-side); R1 (handshake correctness), R8 (≥2 impls).
  imports:
    - github.com/hashicorp/go-plugin  # GRPCPlugin substrate, handshake
    - google.golang.org/grpc  # gRPC server/client
    - github.com/mellifera/mellifera/proto/mellifera/scanner/v1  # scannerv1 types
    - github.com/mellifera/mellifera/proto/mellifera/plugin/v1  # pluginv1 (Plugin service)
  allowed_imports:
    - github.com/hashicorp/go-plugin  # GRPCPlugin, handshake config, serve
    - google.golang.org/grpc  # gRPC server/client plumbing
    - github.com/mellifera/mellifera/proto/mellifera/scanner/v1  # Scanner service types
    - github.com/mellifera/mellifera/proto/mellifera/plugin/v1  # Plugin handshake/health types
    - context  # Scan ctx
    - os  # signal handling in Serve
    - os/signal  # Serve signal handling
  allowed_categories:
    - stdlib
  precondition: |
    `proto/mellifera/scanner/v1` + `proto/mellifera/plugin/v1` packages compile (T02 done). evidence: contracts.md §9 (sdk imports proto + go-plugin + grpc). No `pkg/sdk/` exists yet (greenfield — source_baseline.md:14).
  behaviors:
    - B1: `Scanner` interface exposes `Scan(ctx, *scannerv1.ScanRequest) (<-chan *scannerv1.DiscoveredFile, error)` (channel = stream) + `Identify(ctx, *scannerv1.IdentifyRequest) (*scannerv1.IdentifyResult, error)` | ac: AC-1 | kind: normal
    - B2: `ScannerPlugin` satisfies `plugin.GRPCPlugin`: `GRPCServer` registers a `scannerv1.ScannerServer` that adapts the author's channel-based `Scanner.Scan` into the gRPC stream; `GRPCClient` returns a `Scanner` wrapping the gRPC stub | ac: AC-1 | kind: normal
    - B3: `Serve(cfg HandshakeConfig, plugins ...plugin.GRPCPlugin)` validates the magic cookie, registers the gRPC services, and handles SIGINT/SIGTERM for clean shutdown | ac: AC-1 | kind: normal
    - B4: in-process round-trip — a fake `Scanner` served via `Serve` in-process, dialed through go-plugin, returns the channel the fake emitted (proves the dual-side adapter + seam S5 in-process) | ac: AC-2 | kind: normal
    - B5: `Scan` channel is buffered with a small bound (suggest 16) so a fast scanner cannot memory-blow a slow consumer; ctx cancellation propagates to the stream | ac: AC-1 | kind: edge
  invariants:
    - INV1: `Scanner` is the ONLY interface in the feature (R8). It has ≥2 real implementations: the subprocess client wrapper (this task's GRPCClient) + the in-process test fake (used by T06/T07 tests). The interface is justified at the plugin seam — exactly where the skill permits it.
    - INV2: `pkg/sdk` is a shared LEAF — it MAY NOT import any `internal/*` package (contracts.md §10). External plugins import it.
    - INV3: Scan channel buffering bound is small (≤32); the orchestrator (T07) drains at store-write speed, providing natural backpressure (R9).
    - INV4: Exported symbol count for pkg/sdk = 5 (HandshakeConfig, Capability, Scanner, ScannerPlugin, Serve). Under 8.
  postcondition: |
    (AC-1/AC-2) `pkg/sdk` ships `Serve`, `ScannerPlugin`, `Scanner`, `HandshakeConfig`, `Capability`; an in-process round-trip test proves the dual-side gRPC adapter; ≤8 symbols; `go test ./pkg/sdk/` green.
  test_seed: |
    # arrange: T02 protos compiled; a fake Scanner impl emitting 2 fixed DiscoveredFiles. act: sdk.Serve(in-process, ScannerPlugin{Impl: fake}); dial via go-plugin test harness; call Scan. assert: received channel yields exactly the 2 files; Identify returns the fake's fixed result.
  spec: |
    Signatures (contracts.md §9 — copy verbatim, no new exports):
    type HandshakeConfig struct { MagicCookieKey, MagicCookieValue, CoreVersion, PluginID, PluginVersion string }
    type Capability struct { Type, ID, ProtoService string }
    type Scanner interface { Scan(ctx context.Context, req *scannerv1.ScanRequest) (<-chan *scannerv1.DiscoveredFile, error); Identify(ctx context.Context, req *scannerv1.IdentifyRequest) (*scannerv1.IdentifyResult, error) }
    type ScannerPlugin struct { Impl Scanner }
    func Serve(cfg HandshakeConfig, plugins ...plugin.GRPCPlugin)

    Steps:
    1. Write `doc.go`: responsibility (thin SDK), public API (5 symbols), invariants (R8 ≥2 impls, leaf-package, buffering). Apache header.
    2. `scanner.go`: `Scanner` interface + `ScannerPlugin` (GRPCServer builds a `scannerServer` adapting Impl.Scan channel→stream + forwarding Identify; GRPCClient returns a `scannerClient` wrapping the gRPC stub into the `Scanner` interface). `Capability` struct.
    3. `serve.go`: `Serve` — build `plugin.HandshakeConfig` from cfg (MagicCookieKey/Value), `plugin.Serve` with the provided GRPCPlugins + a signal-driven exit. Validate cookie before serving.
    4. Table test (`scanner_test.go`/`serve_test.go`): in-process fake Scanner, Serve via `plugin.Serve` test helpers OR `plugin.Handshake` + gRPC dial-in-process, assert stream round-trip + Identify + ctx cancellation aborts.
  test_exclusions:
    - "HandshakeConfig / Capability — plain data structs, exercised via the Serve/ScannerPlugin table tests"
  error_handling:
    - "magic cookie mismatch on Serve": go-plugin exits non-zero (HandshakeConfig mismatch is fatal) — surface a clear error, do not serve.
    - "gRPC dial failure": returned as error from the client constructor; caller (T06 Manager) handles restart.
  callers_to_update: []
  contract_test_scope:
    - joint: pkg/sdk (server) -> pkg/sdk (client) over in-process gRPC | assert: DiscoveredFile stream + IdentifyResult round-trip preserve file_id/relative_path/ffprobe_json bytes + parsed Struct
  negative_examples:
    - "DO NOT add a second interface — `Scanner` is the only one (R8)."
    - "DO NOT import any `internal/*` package (leaf)."
    - "DO NOT use `reflect` (depguard denies it)."
    - "DO NOT exceed 8 exported symbols."
  existing_code_snapshot: |
    (GREENFIELD — pkg/sdk/ does not exist. evidence: source_baseline.md:14.)
  source_anchor: contracts.md:269-303 (§9 pkg/sdk interface); File Map implementation_plan.md:103-108 (pkg/sdk rows)
  scope_boundary: "This task ONLY creates files under mellifera/pkg/sdk/ + edits mellifera/go.mod (add go-plugin, grpc). No other files."
  out_of_scope:
    - mellifera/internal/plugin/  # T06 owns the Manager (client side lifecycle)
    - mellifera/plugins/base-scanner/  # T08 owns the author-side impl
  line_budget: 600
  line_budget_flex: 1.3
  acceptance_criteria:
    - scenario: AC-1 | given: sdk + later base-scanner | when: scan streams DiscoveredFile | then: items reach the store (sdk adapter proven in-process here)
    - scenario: AC-2 | given: feature branch | when: `go test ./pkg/sdk/` + check.sh | then: green + ≤8 symbols + table test per export
  verify: cd mellifera && go test ./pkg/sdk/... && go vet ./pkg/sdk/...
