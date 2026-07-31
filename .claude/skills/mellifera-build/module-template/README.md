# Module template

A worked example of Mellifera's AI-navigable module structure: a tiny pure
package (`greet`) with a contract-first `doc.go`, a small implementation, and a
table-driven test.

## To start a new module

1. `cp -r .claude/skills/mellifera-build/module-template internal/<yourmodule>`
2. Rename the package `greet` → `<yourmodule>` in `doc.go`, `<yourmodule>.go`, `*_test.go`.
3. **Write the `doc.go` contract first** — responsibility, public API (≤8 symbols), invariants — *before* implementation.
4. Implement pure functions. Push I/O out to `store/`, `plugin/`, `stream/`, `api/`, or `janitor/`.
5. Add a table-driven test for **every** exported symbol. If a symbol can't be tested with one table, the API is too wide — redesign.
6. Add the package to the module map in `SKILL.md` and `docs/ai-architecture.md`.
7. Run `./.claude/skills/mellifera-build/scripts/check.sh`.

## Dependency direction

Deps point **down** only:

```
api → enrich → {module, plugin} → store
```

No cycles. `proto/` and `pkg/sdk` are shared leaves.
