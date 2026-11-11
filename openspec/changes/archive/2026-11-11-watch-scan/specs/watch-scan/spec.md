# Spec Delta

## Purpose

Automatically keeps each library's catalog converged with its folder on disk:
the server watches every library root for filesystem changes and triggers the
library's existing scan when the root goes quiet, with a periodic re-scan as
the safety net — so vanished/renamed files are tombstoned and new files appear
without the operator issuing a manual scan request.

## ADDED Requirements

### Requirement: Automatic scan on filesystem change
While the watcher is enabled, the server SHALL watch each library's root
subtree recursively for filesystem changes and SHALL trigger a scan of that
library once its root has stayed quiet for the debounce window after the most
recent change; a change arriving during the wait SHALL extend the wait (a
quiet window, not a fixed delay). Changes observed while a triggered scan is
still running SHALL NOT be dropped: one trailing scan SHALL follow the running
scan's completion.

#### Scenario: created-file-triggers-scan
- **WHEN** a media file is created under a watched library root and no further change occurs for the debounce window
- **THEN** a scan of that library runs without any manual request and the item appears in the catalog

#### Scenario: renamed-replacement-tombstones-old-row
- **WHEN** a watched item's file is removed and a replacement file appears under the same root (a re-download under a renamed variant)
- **THEN** the triggered scan tombstones the old item row and persists the replacement, without any manual scan request

#### Scenario: mid-run-changes-schedule-one-trailing-scan
- **WHEN** the root changes while a triggered scan of that library is still running
- **THEN** no second concurrent scan starts during the run, and exactly one trailing scan follows it so the late changes are not dropped

### Requirement: Single-flight per library across manual and automatic triggers
For any library, at most one scan SHALL run at a time. A scan trigger arriving
while that library's scan is running SHALL join the running scan (wait for its
outcome) instead of starting a second concurrent scan, whichever kind of
trigger arrived first. Triggers for DIFFERENT libraries SHALL NOT block each
other. The manual scan endpoint SHALL answer with the outcome of the single
scan that ran.

#### Scenario: manual-joins-automatic
- **WHEN** a manual scan request for a library arrives while an automatically triggered scan of that library is running
- **THEN** exactly one scan runs, and the manual request answers with that scan's outcome after it completes

#### Scenario: automatic-joins-manual
- **WHEN** an automatic trigger fires for a library while its manual scan is running
- **THEN** no second scan starts and the automatic trigger joins the running manual scan

#### Scenario: distinct-libraries-run-independently
- **WHEN** scan triggers fire for two different libraries at the same time
- **THEN** both libraries' scans run — the single-flight is per library, never global

### Requirement: Periodic reconciliation walk
While the watcher is enabled, the server SHALL trigger a scan of every watched
library at a fixed periodic cadence regardless of filesystem events, so a
missed or undeliverable event still converges the catalog within one interval.
A cadence tick landing on a library whose scan is already running SHALL fold
into the same trailing-scan rule as a filesystem change (no concurrent second
scan, one trailing scan).

#### Scenario: quiet-period-still-rescans
- **WHEN** no filesystem change occurs under a watched library for a full reconcile interval
- **THEN** that library is still scanned once by the periodic walk

#### Scenario: reconcile-coalesces-with-running-scan
- **WHEN** the periodic walk fires for a library whose scan is already running
- **THEN** no second concurrent scan starts and one trailing scan follows the running one

### Requirement: Watch set follows library CRUD
The set of watched roots SHALL follow the libraries catalog: a library created
while the server runs SHALL become watched within one reconcile interval, and
a deleted library SHALL stop triggering automatic scans within one reconcile
interval.

#### Scenario: new-library-becomes-watched
- **WHEN** a library is created through the API while the server is running
- **THEN** within one reconcile interval, changes under its root trigger scans of that library

#### Scenario: deleted-library-stops-autoscan
- **WHEN** a library is deleted
- **THEN** within one reconcile interval, changes under its former root no longer trigger any scan

### Requirement: Watcher lifecycle and operator knobs
The watcher SHALL be enabled by default and SHALL run for the process lifetime
beside serving without delaying startup: startup SHALL NOT run a boot scan
(the first periodic walk happens one interval after start). The watcher SHALL
degrade gracefully — a watcher failure SHALL never fail an HTTP request nor
abort startup; it at worst reverts the server to manual-only scanning. A
reconcile interval of zero or less SHALL disable the watcher ALONE: no watches
installed, no automatic triggers, and the manual scan endpoint remains the
only trigger (today's behavior). Knob parsing SHALL follow the operator
convention: unset or malformed values fall back to the default with a logged
warning, and startup never aborts on them.

#### Scenario: disabled-watcher-restores-manual-only
- **WHEN** the reconcile interval env knob is set to 0
- **THEN** no filesystem watch is installed and no automatic scan ever fires, while a manual scan request still scans the library normally

#### Scenario: malformed-knob-falls-back-with-warning
- **WHEN** a watcher env knob is set to a malformed value
- **THEN** the default value is used, a warning is logged naming the knob, and startup proceeds normally
