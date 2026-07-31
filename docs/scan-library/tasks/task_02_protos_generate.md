- [x] Task 02 (coder): Extract protos verbatim + generate Go bindings
  target: mellifera/proto/mellifera/{common,scanner,metadata,plugin}/v1/*.proto, mellifera/proto/mellifera/.../v1/*.pb.go (+_grpc.pb.go), mellifera/buf.yaml, mellifera/buf.gen.yaml | action: CREATE
  archetype: external-services
  skill_hint: contracts
  feature_goal: (see T01)
  why: The four proto packages are the gRPC contracts every plugin + the core build on. Fidelity is load-bearing (R3): a renamed field here propagates to every later plugin. AC-3 asserts verbatim extraction. The generated `.pb.go` is COMMITTED so CI/test/build never need buf installed (only regeneration does).
  data_flow: enters from: mellifera/docs/architecture.md §2 (authoritative blocks §2.1.1 common, §2.1.2 scanner, §2.1.3/§2.1.4 metadata, §2.2.2 plugin) → transforms: character-for-character copy into .proto + buf codegen → emits to: T03 pkg/sdk, T06 plugin, T07 scan, T08 base-scanner (consume generated `scannerv1.*`, `commonv1.*`, `pluginv1.*` types).
  related: consumer T03,T06,T07,T08; seams S-noop (build artifacts) + S5 (scanner protos exercised at the gRPC seam); R2/T13 (generated .pb.go excluded from symbol-count gate).
  imports:
    - google.golang.org/protobuf  # generated base
    - google.golang.org/grpc  # generated _grpc.pb.go
  allowed_imports:
    - (generated code — no hand-written imports; the .proto files import only google/protobuf/* per contracts.md §10)
  allowed_categories:
    - stdlib
  precondition: |
    `mellifera/go.mod` exists (module `github.com/mellifera/mellifera`, go 1.22+). evidence: T01 postcondition. No `mellifera/proto/` tree exists yet (greenfield — source_baseline.md:14-15).
  behaviors:
    - B1: Four `.proto` files created at the exact paths: `proto/mellifera/common/v1/common.proto`, `proto/mellifera/scanner/v1/scanner.proto`, `proto/mellifera/metadata/v1/metadata.proto`, `proto/mellifera/metadata/v1/request_spec.proto`, `proto/mellifera/plugin/v1/plugin.proto` — each a verbatim copy of its arch §2 block (§2.1.1, §2.1.2, §2.1.3, §2.1.4, §2.2.2) | ac: AC-3 | kind: normal
    - B2: `buf.yaml` configured with roots = `proto/` and lint clean; `buf.gen.yaml` configures `protoc-gen-go` + `protoc-gen-go-grpc` outputting alongside the `.proto` files | ac: AC-3 | kind: normal
    - B3: Generated `*.pb.go` (+ `*_grpc.pb.go` for services) committed under `proto/mellifera/.../v1/`; `go build ./proto/...` compiles all four packages | ac: AC-2 | kind: normal
    - B4: Scanner service `Scan` is `stream DiscoveredFile` and `DiscoveredFile.ffprobe_json` is `bytes` (not Struct) — verbatim from arch §2.1.2 | ac: AC-3 | kind: edge
    - B5: `buf lint` passes (if buf available); if buf is NOT installed, generation falls back to `protoc` 29.3 with the same plugins and the same output layout (see MISSING-FLAG below) | ac: AC-3 | kind: error
  invariants:
    - INV1: VERBATIM rule (R3) — no renamed fields, no added/removed comments vs arch §2, no "improvements". AC-3 diffs against arch §2.
    - INV2: Only `common` + `scanner` are exercised this feature; `metadata` + `plugin` protos are generated for CONTRACT COMPLETENESS only (additive, deprecate-don't-delete). No code under `internal/` may import the metadata service this feature (contracts.md §1).
    - INV3: The generated `.pb.go` files are COMMITTED to git (CI must not require a buf/protoc install). buf is a dev-only toolchain dep.
  postcondition: |
    (AC-3/AC-2) All four proto packages exist verbatim from arch §2; `*.pb.go` generated + committed; `go build ./proto/...` exits 0; `buf lint` clean (or protoc fallback documented).
  test_seed: |
    # arrange: arch §2 blocks + go.mod from T01. act: copy protos verbatim; run `buf generate` (or protoc fallback). assert: `go build ./proto/...` exits 0; `grep -c 'bytes ffprobe_json' proto/mellifera/scanner/v1/scanner.proto` >= 1; diff each .proto against arch §2 → only whitespace within protoc tolerance.
  spec: |
    Signatures:
    (no hand-written Go — generated only. proto service shapes per contracts.md §1:
     scanner.Scanner: Scan(ScanRequest) returns (stream DiscoveredFile); Identify(IdentifyRequest) returns (IdentifyResult).
     plugin.Plugin: Handshake/Health/Shutdown.
     metadata.MetadataSource: (generated, NOT exercised).)

    Steps:
    1. Read `mellifera/docs/architecture.md` §2.1.1 (common), §2.1.2 (scanner), §2.1.3 (metadata service), §2.1.4 (request_spec), §2.2.2 (plugin). Copy each proto block CHARACTER-FOR-CHARACTER into the matching `proto/mellifera/<pkg>/v1/*.proto`. Set `package mellifera.<pkg>.v1;` + `go_package` option = `github.com/mellifera/mellifera/proto/mellifera/<pkg>/v1;<pkg>v1`.
    2. Create `buf.yaml` (version: v1, name: mellifera, lint: use DEFAULT, breaking: use FILE; roots include `proto/`). Create `buf.gen.yaml` (version v1; plugins: protoc-gen-go out: . opt: paths=source_relative; protoc-gen-go-grpc out: . opt: paths=source_relative).
    3. Run generation. PREFERRED: `buf generate` (planner decision: buf). MISSING-FLAG: if `buf` is NOT on PATH (environment has `protoc` 29.3 but NOT buf per state.json phase_log note), FALLBACK to `protoc` with the same two plugins:
       `protoc -I proto --go_out=. --go_opt=module=github.com/mellifera/mellifera --go-grpc_out=. --go-grpc_opt=module=github.com/mellifera/mellifera proto/mellifera/.../v1/*.proto`
       Document in the handoff which generator was used + that output is identical (both use protoc-gen-go + protoc-gen-go-grpc). COMMIT the generated `*.pb.go`/`*_grpc.pb.go` regardless of path.
    4. `go mod tidy` (adds `google.golang.org/protobuf` + `google.golang.org/grpc`). Add `buf`/`protoc-gen-go`/`protoc-gen-go-grpc` as dev toolchain notes only (NOT module deps).
    5. `cd mellifera && go build ./proto/...` must exit 0. If `buf` is installed, `buf lint` must exit 0.
  test_exclusions:
    - "*.pb.go / *_grpc.pb.go — framework-generated code (protoc-gen-go). Exempt from symbol-count gate (R2/T13) and from hand-written table tests."
  error_handling:
    - "buf not installed on PATH": FALLBACK to protoc 29.3 (same plugins, same output). Document in handoff. Do NOT block the build.
    - "protoc-gen-go / protoc-gen-go-grpc not installed": `go install google.golang.org/protobuf/cmd/protoc-gen-go@latest` + `go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest`, then re-run.
  callers_to_update: []
  negative_examples:
    - "DO NOT rename any proto field, message, or service vs arch §2 (R3 verbatim rule)."
    - "DO NOT make `ffprobe_json` a Struct — it is `bytes` (arch §2.1.2; contracts.md §1)."
    - "DO NOT wire the metadata service into any `internal/` import this feature."
    - "DO NOT leave .pb.go uncommitted — CI must build without buf/protoc installed."
  existing_code_snapshot: |
    (GREENFIELD — proto/ tree does not exist yet. Source blocks live in mellifera/docs/architecture.md §2.1.1/§2.1.2/§2.1.3/§2.1.4/§2.2.2.)
  source_anchor: contracts.md:8-44 (§1 gRPC service contract, verbatim rule R3); File Map implementation_plan.md:93-101 (proto rows)
  scope_boundary: "This task ONLY creates files under mellifera/proto/ + mellifera/buf.yaml + mellifera/buf.gen.yaml, and edits mellifera/go.mod (go mod tidy for protobuf/grpc). No other files."
  out_of_scope:
    - mellifera/pkg/sdk/  # T03
    - any internal/ package  # later tasks
  line_budget: 900
  line_budget_flex: 1.3
  acceptance_criteria:
    - scenario: AC-3 | given: the four .proto files | when: diff against arch §2 + `buf lint` + `go build ./proto/...` | then: verbatim match; lint clean; all four .pb.go packages compile
    - scenario: AC-2 | given: feature branch at completion | when: `go build ./proto/...` | then: exits 0
  verify: cd mellifera && go build ./proto/... && test -f proto/mellifera/scanner/v1/scanner.pb.go
