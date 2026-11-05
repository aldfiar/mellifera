#!/usr/bin/env bash
# Mellifera complexity-budget gate.
# Fails if any package/file/function exceeds the AI-navigability budgets.
# Run from the project root (where go.mod lives). See docs/ai-architecture.md.
set -euo pipefail

# Activate only once the codebase is initialized (proto-extraction pass).
if [[ ! -f go.mod ]]; then
  echo "check.sh: no go.mod yet — codebase not initialized. Gate is inert until Go packages exist."
  exit 0
fi

echo "==> golangci-lint (funlen, gocognit, gocyclo, lll, depguard, dupl)"
if command -v golangci-lint >/dev/null 2>&1; then
  golangci-lint run ./...
else
  echo "  golangci-lint not installed. Install: brew install golangci-lint  (or: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)" >&2
  exit 1
fi

echo "==> exported-symbol count per package (warn >8, fail >12)"
# Heuristic: counts top-level func/type/var/const starting uppercase.
# Authoritative view: `go doc <pkg>`.
FAIL=0
while IFS= read -r pkg; do
  dir=$(go list -f '{{.Dir}}' "$pkg" 2>/dev/null || true)
  [[ -d "$dir" ]] || continue
  # Hand-written public API surface only — exclude tests + generated code
  # (*.pb.go / *_grpc.pb.go from protoc, *.gen.go). Generated symbols aren't
  # authored API, so they never count against the ≤8/≤12 budget (R2).
  # The source list is built with a portable while-read loop (no bash-4
  # mapfile), so the gate runs under macOS default bash 3.2 as well as 4+.
  srcs=()
  while IFS= read -r f; do
    srcs+=("$f")
  done < <(find "$dir" -maxdepth 1 -type f -name '*.go' ! -name '*_test.go' ! -name '*.pb.go' ! -name '*.gen.go')
  [[ ${#srcs[@]} -gt 0 ]] || continue
  # Belt-and-suspenders: grep also skips generated protos in case the find
  # filter above ever regresses (intent preservation per R2).
  # `|| true` tolerates grep's exit-1 on packages with zero uppercase exports
  # (e.g. package main) under `set -euo pipefail`, so the loop completes.
  count=$(grep -rhE --exclude='*.pb.go' --exclude='*.gen.go' '^[[:space:]]*(func|type|var|const) [A-Z]' "${srcs[@]}" 2>/dev/null | wc -l | tr -d ' ' || true)
  if (( count > 12 )); then
    echo "  FAIL  $pkg: $count exported symbols (>12) — split the package"; FAIL=1
  elif (( count > 8 )); then
    echo "  WARN  $pkg: $count exported symbols (>8)"
  fi
done < <(go list ./... 2>/dev/null)

echo "==> principalFromContext placement rule"
# principalFromContext exposes the RAW auth principal. Only the auth chain
# (middleware.go) and the ONE principal→Viewer translation point (viewerFor in
# viewer.go) may touch it — the l6-accounts-access design: ONE translation per
# request, stashed via access.WithViewer. Handlers consume the stashed Viewer
# through access.FromContext / viewerFor; re-deriving authority from the raw
# principal elsewhere bypasses that design, so a third non-test file fails.
pfc_offenders=()
while IFS= read -r f; do
  case "$f" in
    internal/api/middleware.go|internal/api/viewer.go) ;;
    *) pfc_offenders+=("$f") ;;
  esac
done < <(grep -rln 'principalFromContext' internal/api --include='*.go' 2>/dev/null | grep -v _test || true)
if (( ${#pfc_offenders[@]} > 0 )); then
  for f in "${pfc_offenders[@]}"; do
    echo "  FAIL  $f: principalFromContext is legal ONLY in internal/api/middleware.go and internal/api/viewer.go — consume the Viewer via access.FromContext / viewerFor"
  done
  echo "check.sh: FAILED — principalFromContext placement rule violated."
  exit 1
fi

if (( FAIL )); then
  echo "check.sh: FAILED — complexity budget exceeded. Redesign; do not relax the budget."
  exit 1
fi
echo "check.sh: OK"
