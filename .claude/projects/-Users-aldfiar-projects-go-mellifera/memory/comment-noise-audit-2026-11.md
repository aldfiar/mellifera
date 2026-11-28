---
name: comment-noise-audit-2026-11
description: 6-agent wf-auditor comment-noise sweep 11 Nov — findings at .tmp/comment-noise-audit.md, 4 P0s, ~7.4-7.9k compressible lines, cleanup NOT yet executed
metadata:
  type: project
---

On 11 Nov 2026 six wf-auditor agents swept all Go packages under the go-clean-code
comment law (read-only). Full collected inventory: `.tmp/comment-noise-audit.md`
(P0/P1 index, cross-cutting patterns, execution order). Cleanup NOT yet executed.

Headlines: 4 P0 stale/misleading comments (web.go:49-51, store/doc.go INV5,
api/viewer.go:26-33 tutorial, recs_ordering.go detached doc at 493-513 vs real
func at 731); ~7,400-7,900 compressible comment lines repo-wide; worst files
api/router.go 73%, sourcestate.go 77%, pack/pack.go 66%, naming/binding.go 63%,
api/viewer.go 59%; debt is essay-length + invariant duplication (comment-DRY),
not narration. 3 secondary CODE findings (releasename regex dup, dead alias
enrich/queue.go:405, factNamespaces dup). go-clean-code skill anchor stale:
internal/pack/pack.go is 66% now (30% anchor = internal/stream/pack.go).

**Why:** future cleanup passes should execute per-file trims as explicit tasks
(law forbids drive-by sweeps), P0s first; the file has the full order.

**How to apply:** when user asks for the comment cleanup, read
.tmp/comment-noise-audit.md, work the execution order top-down, verify with
gofmt -l + build/vet + touched tests per touch.
