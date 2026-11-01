// SPDX-License-Identifier: Apache-2.0

package pack

// MasterRuleVersion is the pack-lane rule version the success persist writes
// as the `streams.master` value (fix-tv-unblock-2 Interfaces 2): boolean
// `true` was the legacy v1 write (pack-manifest-audio — the lane-composed
// master, same rule version but unversioned), the number here is v2 (the
// total-audio layout rule). The lazy re-heal gate (cmd/mellifera's
// legacyRepackOnPlay) reads a stored namespace stale iff its version is
// older than this constant, so every previously-packed build re-heals once
// through the ordinary enqueue path. The constant lives here — the shared
// vocabulary package: enrich must not import internal/stream (the PackItem
// seam boundary), and both the writer (enrich) and the reader
// (cmd/mellifera) already import this leaf.
const MasterRuleVersion = 2

// PackOutcome is one published packaging build, returned over the Deps.PackItem
// seam (Interface 2). Playlist is the /media-relative artifact pointer under
// the run's build-nonce directory; Nonce is that directory's name. Codecs is
// the build's recorded RFC 6381 codec strings (playback-capability-gate D2 —
// video first, then audio in rendition order; nil when uncomposable, which
// rides the completion write as an absent key). Layout is the build's audio
// layout name (fix-tv-unblock-2 Interfaces 1 — "single-variant" | "rendition",
// decided at publish); empty means the build predates the layout record and
// rides the completion write as an absent key (fail-open).
type PackOutcome struct {
	Playlist string
	Nonce    string
	Codecs   []string
	Layout   string
}
