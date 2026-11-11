// SPDX-License-Identifier: Apache-2.0

package pack

// MasterRuleVersion is the pack-lane rule version the success persist writes
// as the `streams.master` value (fix-tv-unblock-2 Interfaces 2; the legacy
// v1 write was an unversioned boolean — pack-manifest-audio). The lazy
// re-heal gate (cmd/mellifera's legacyRepackOnPlay) reads a stored
// namespace stale iff its version is older than this constant, so every
// previously-packed build re-heals once through the ordinary enqueue path.
// It lives here — the shared vocabulary leaf: enrich must not import
// internal/stream (the PackItem seam boundary), and both the writer (enrich)
// and the reader (cmd/mellifera) already import this package.
const MasterRuleVersion = 2

// PackOutcome is one published packaging build, returned over the
// Deps.PackItem seam (Interface 2): Playlist is the /media-relative
// artifact pointer under the run's build-nonce directory (Nonce its name);
// Codecs is the build's recorded RFC 6381 codec strings
// (playback-capability-gate D2 — video first, then audio in rendition
// order); Layout is the audio layout name (fix-tv-unblock-2 Interfaces 1).
// Uncomposable codecs and pre-record builds ride the completion write as
// absent keys (nil / empty — fail-open).
type PackOutcome struct {
	Playlist string
	Nonce    string
	Codecs   []string
	Layout   string
}
