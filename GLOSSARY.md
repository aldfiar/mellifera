# GLOSSARY

Canonical vocabulary for mellifera. Definitions only — design notes live in specs and proposals.

- **Client (enrichment context)** — an HTTP consumer of the mellifera API (the SPA or any REST caller) that can *trigger* enrichment of an entity. The server always executes enrichment fetches (fetch mode A). Not the go-plugin host (that is always mellifera core), and not a mode B credential holder.
- **Fetch mode A / mode B** — who executes a plugin-built RequestSpec: A = the server; B = a client holding the upstream credentials (contract-supported, not built).
- **Enrichment queue** — the derived set of pending (row, plugin) work, computed from rows + namespaces + the failure ledger. There is no queue, claim, or lease table; work is never stored, only derived.
- **Namespace** — the per-plugin subtree an enrichment plugin owns inside an item/series document (`sources.<plugin_id>`, plus its `_provenance` / `_view` entries). A plugin may write only its own namespace.
- **Refresh** — an explicit operator action re-running one plugin's enrichment on a row or library: the plugin's namespace, provenance and view entries are removed and its ledger row cleared, and the existing derivation re-runs it. Replaces the namespace wholesale; user title overrides are untouched.
- **Drifted row** — a row whose recorded provenance `plugin_version` differs from the running plugin's version. Computed on demand from documents; never stored.
- **Film (serial library)** — a direct video file inside a serial library handled by the film parse path (movie-shaped metadata); not a library type.
- **Collection** — the library itself (a registered root directory with its parser chain and options). Not a separate stored entity; every collection surface renders a library.
- **Subcollection** — the grouping level inside a collection, per library type: for serial libraries the series; for image libraries the album (depth-1 folder grouping). Not a stored entity.
- **Element** — an item (episode, film, tv record, image) as a member of its subcollection.
- **Naming option** — the per-library display-naming setting (group style, element name template); absent fields fall through to the module default template. Stored as flat library columns, PATCHable.
- **display_name** — the server-composed display name of an item or series, served on the wire and never persisted: title override → composed name (facts + resolved series + template) → verbatim `_view.title` → empty string. Never the raw filename, never a fabricated value.
