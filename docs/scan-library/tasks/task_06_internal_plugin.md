- [x] Task 06 (coder): Implement internal/plugin (subprocess lifecycle + gRPC clients)
  target: mellifera/internal/plugin/doc.go, mellifera/internal/plugin/manager.go, mellifera/internal/plugin/*_test.go | action: CREATE
  archetype: external-services
  skill_hint: stack-patterns
  feature_goal: (see T01)
  why: THE subprocess-isolation differentiator (arch §0 principle 2). The Manager launches the base-scanner binary via go-plugin (magic cookie, gRPC dial, Plugin.Handshake), holds typed capability clients, and implements minimal restart/backoff (§7.3). `Scanner(pluginID, capID)` is the typed accessor realizing the module map's `Call` without reflect. Hardest integration piece (R1). Symbol count = 9 (WARN >8, <12; pre-justified R10).
  data_flow: enters from: T03 pkg/sdk (ScannerPlugin/HandshakeConfig) + T02 proto (pluginv1/scannerv1) → transforms: launch subprocess, negotiate gRPC, register capability stubs, hold typed sdk.Scanner client; on crash → backoff + restart → emits to: T07 scan (Manager.Scanner → sdk.Scanner), T10 cmd (Open/Load/Start wiring).
  related: producer T03 (sdk), T02 (proto); consumers T07, T10; seams S3 (Scanner accessor), S5 (gRPC subprocess seam — owner side), S11 (wiring); R1 (handshake), R9 (backpressure).
  imports:
    - github.com/hashicorp/go-plugin  # subprocess launch + handshake
    - google.golang.org/grpc  # gRPC dial
    - github.com/mellifera/mellifera/pkg/sdk  # Scanner, Capability, ScannerPlugin
    - github.com/mellifera/mellifera/proto/mellifera/plugin/v1  # pluginv1 Health/Handshake
    - github.com/mellifera/mellifera/proto/mellifera/scanner/v1  # scannerv1 (typed accessor)
    - context
    - sync  # mutex around client map + restart state
    - time  # backoff timing
    - math/rand  # jitter
    - os/exec  # (only if Manager itself invokes the binary; go-plugin usually does) — arg-slice only if used
  allowed_imports:
    - github.com/hashicorp/go-plugin
    - google.golang.org/grpc
    - github.com/mellifera/mellifera/pkg/sdk
    - github.com/mellifera/mellifera/proto/mellifera/plugin/v1
    - github.com/mellifera/mellifera/proto/mellifera/scanner/v1
    - context
    - sync
    - time
    - math/rand
    - os/exec  # arg-slice ONLY if the Manager directly builds the cmd; NEVER sh -c
  allowed_categories:
    - stdlib
  precondition: |
    `pkg/sdk` (T03) + proto packages (T02) compile. No `internal/plugin/` exists (greenfield — source_baseline.md:14).
  behaviors:
    - B1: `Open(Deps)` returns a `*Manager` holding the magic-cookie + core-version config (no subprocess launched yet) | ac: AC-1 | kind: normal
    - B2: `Load(pluginID, binaryPath, caps []sdk.Capability)` registers a plugin + its capability declarations WITHOUT launching (dev mode: binaryPath is a filesystem path) | ac: AC-1 | kind: normal
    - B3: `Start(ctx, pluginID)` launches the subprocess via go-plugin with the magic cookie, runs `Plugin.Handshake`, registers capability stubs, and marks the plugin serving | ac: AC-1 | kind: normal
    - B4: `Scanner(pluginID, capabilityID)` returns the typed `sdk.Scanner` client wrapping the live gRPC connection (no reflect; returns error if not loaded/started or capability unregistered) | ac: AC-1 | kind: normal
    - B5: `Status(pluginID)` returns `Health{State, Message, Restarts, LastCheckedAt}` (the module map's `Health` realized as a method returning the `Health` type, avoiding the name collision) | ac: AC-1 | kind: normal
    - B6: `Stop(ctx, pluginID)` sends Shutdown RPC + SIGTERM with a 10s grace period (arch §7.4) | ac: AC-2 | kind: normal
    - B7: on unexpected subprocess exit → exponential backoff (initial 1s, factor 2, cap 60s, jittered); 3 consecutive failed restarts → `failed` state, no further attempts without intervention (§7.3) | ac: AC-2 | kind: error
    - B8: in-process fake plugin via `sdk.Serve`, dialed through `Manager`, `Scanner(...).Scan` returns the fake's stream — proves seam S5 in-process before the real binary (R1 mitigation) | ac: AC-2 | kind: normal
  invariants:
    - INV1: `Scanner(pluginID, capID)` is a TYPED accessor (no reflect, no protobuf.Any). The module map's generic `Call` is realized as per-capability typed accessors; this is the scanner one. (Decision log.)
    - INV2: Minimal restart (§7.3): backoff 1s→2x→cap 60s, jittered; 3 fails → `failed`. `DEGRADED` is a non-blocking warning; `NOT_SERVING` triggers restart.
    - INV3: Manager MAY NOT depend on `store` (module map: plugin → proto/sdk only). It depends on `pkg/sdk` + generated protos.
    - INV4: Magic-cookie handshake: core sets `MELLIFERA_MAGIC_COOKIE` env; the plugin (via sdk.Serve) validates it before serving (arch §2.2.1). Mismatch = fatal.
    - INV5: Exported symbol count = 9 (3 types: Manager/Deps/Health + Open + Load/Start/Stop/Status/Scanner). WARN (>8) but <12; PRE-JUSTIFIED (R10). Do not add more.
  postcondition: |
    (AC-1/AC-2) `internal/plugin` ships Manager + Open/Load/Start/Stop/Status/Scanner (9 symbols, WARN justified); in-process fake-plugin round-trip proves S5; restart backoff per §7.3; `go test ./internal/plugin/` green.
  test_seed: |
    # arrange: an in-process fake Scanner served via sdk.Serve (a tiny test main or sdk.Serve in the test process). act: Manager.Open; Load("fake", path, [scanner cap]); Start; Scanner("fake","default").Scan. assert: stream received; Status().State=="serving"; Stop → clean exit.
  spec: |
    Signatures (contracts.md §5 — copy verbatim):
    type Manager struct { /* per-pluginID go-plugin clients + capability registry + restart state */ }
    type Deps struct { MagicCookieKey, MagicCookieValue, CoreVersion string }
    type Health struct { State, Message string; Restarts int; LastCheckedAt time.Time }
    func Open(deps Deps) *Manager
    func (m *Manager) Load(pluginID, binaryPath string, caps []sdk.Capability) error
    func (m *Manager) Start(ctx context.Context, pluginID string) error
    func (m *Manager) Stop(ctx context.Context, pluginID string) error
    func (m *Manager) Status(pluginID string) (Health, error)
    func (m *Manager) Scanner(pluginID, capabilityID string) (sdk.Scanner, error)

    Steps:
    1. Write `doc.go`: responsibility (subprocess lifecycle + typed capability clients), public API (9, WARN justified), invariants (no reflect, no store dep, minimal restart §7.3, magic-cookie handshake). Apache header.
    2. `manager.go`: `Manager` struct (sync.Mutex-guarded map of pluginID→client + capability registry + restart counters/backoff state). `Open`/`Load`/`Start`/`Stop`/`Status`/`Scanner`. `Start` uses go-plugin's client config (HandshakeConfig from Deps, Plugins map keyed by pluginID→sdk.ScannerPlugin, Cmd = exec.Command(binaryPath) arg-slice, AllowedProtocols=[gRPC]). `Scanner` returns the typed sdk.Scanner from the live client.
    3. Restart goroutine: monitor subprocess exit; on unexpected exit apply backoff+jitter; 3 fails → failed state. `Status` reflects current state + restart count.
    4. Table test (`manager_test.go`): in-process fake plugin (sdk.Serve a fake ScannerPlugin), Load/Start/Scanner round-trip (S5 in-process — R1 mitigation), Status transitions, Stop grace. A controlled crash test asserting backoff + failed-after-3 (use a fake that exits on demand).
  test_exclusions:
    - "Deps / Health — plain data structs, exercised via Open/Status table tests"
  error_handling:
    - "subprocess missing / non-executable binaryPath": Start returns wrapped error (exec.LookPath failure).
    - "Handshake failure (cookie mismatch / timeout)": Start returns error; plugin not marked serving.
    - "Scanner called before Start / unknown capability": return error (typed accessor contract).
    - "repeated subprocess crash": backoff then `failed` after 3 (B7).
  callers_to_update: []
  contract_test_scope:
    - joint: internal/plugin (Manager) -> pkg/sdk (ScannerPlugin) over in-process gRPC | assert: Scanner(pluginID,capID) returns a working sdk.Scanner whose Scan streams + Identify returns
    - joint: internal/plugin -> subprocess lifecycle | assert: unexpected exit triggers backoff; 3 fails → failed state
  negative_examples:
    - "DO NOT use `reflect` or `protobuf.Any` for a generic Call (typed accessor only)."
    - "DO NOT import `internal/store`, `internal/module`, `internal/scan`, `internal/api`."
    - "DO NOT use `sh -c`/`bash -c` to launch the subprocess — go-plugin builds the cmd; if you build one, arg-slice only."
    - "DO NOT exceed 12 symbols (planned 9 — WARN, justified)."
    - "DO NOT retry per-RPC — restart is at the MANAGER level (arch §7.3)."
  existing_code_snapshot: |
    (GREENFIELD — internal/plugin/ does not exist. evidence: source_baseline.md:14.)
  source_anchor: contracts.md:132-167 (§5 plugin Manager interface + invariants); File Map implementation_plan.md:124-128 (plugin rows); arch §7.3/§2.2.1/§2.2.3 (cited source_baseline.md:64-65)
  scope_boundary: "This task ONLY creates files under mellifera/internal/plugin/. No other files."
  out_of_scope:
    - mellifera/plugins/base-scanner/  # T08 (the real binary the Manager launches)
    - mellifera/internal/scan/  # T07 (the consumer)
  line_budget: 900
  line_budget_flex: 1.3
  acceptance_criteria:
    - scenario: AC-1 | given: Manager.Start(base-scanner) | when: scan obtains Scanner | then: gRPC stream flows (S5 proven in-process here, end-to-end in T11)
    - scenario: AC-2 | given: feature branch | when: check.sh + go test ./internal/plugin/ | then: green (plugin WARN-justified at 9 symbols)
  verify: cd mellifera && go test ./internal/plugin/... && grep -rn '"reflect"\|protobuf/any' mellifera/internal/plugin/ ; test $? -eq 1
