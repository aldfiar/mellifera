# Spec Delta

## ADDED Requirements

### Requirement: Request plan per source run
A metadata source's BuildRequest SHALL be able to declare an ordered plan of
additional fetches beyond the primary request: BuildRequestResponse MAY carry
extra request specs, and the core SHALL execute the primary plus each extra
in order at the reserved fetch point — each spec validated and paced by the
plugin's `min_interval_ms` exactly like the primary — and SHALL deliver each
extra's outcome to Convert as an aligned fetched-response list (body, http
status, headers, and a fetched flag carrying the error when the fetch
failed). A failed extra SHALL NOT fail the source run: the run proceeds with
the responses it has and Convert decides what the namespace gains (the
soft-fail posture). The primary request's failure path is unchanged.

#### Scenario: Extra specs are fetched and delivered in order

- **WHEN** BuildRequest declares one extra spec and the source runs
- **THEN** the core fetches the primary and then the extra, and
ConvertRequest carries the extra's body, status, and headers aligned after
the primary's

<!-- wf:probe id=3100aa62f043cfcb -->
```bash
set -e
go test ./internal/enrich -run TestRequestPlan
```
<!-- /wf:probe -->

#### Scenario: A failed extra fetch soft-fails the plan

- **WHEN** an extra spec's fetch fails while the primary succeeds
- **THEN** the source run continues, the extra's entry reports not-fetched
with the error, Convert runs with the primary response, and the namespace
gains only what Convert builds from what arrived

<!-- wf:probe id=92a6f85507ac63a2 -->
```bash
set -e
go test ./internal/enrich -run TestRequestPlan
```
<!-- /wf:probe -->

#### Scenario: Pacing spans the whole plan

- **WHEN** a plan of primary plus one extra runs for a plugin declaring
min_interval_ms
- **THEN** the extra's send starts at least the declared interval after the
primary's on the injectable clock

<!-- wf:probe id=e1b29038e92d1278 -->
```bash
set -e
go test ./internal/enrich -run TestRequestPlan
```
<!-- /wf:probe -->
