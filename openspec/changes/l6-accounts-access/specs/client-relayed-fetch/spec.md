# Spec Delta

## MODIFIED Requirements

### Requirement: Claim endpoint with exactly one claimant

`POST /api/v1/relay/claim` SHALL be open to any authenticated principal
(admin token, device tokens, user sessions) and SHALL hand out at most one
job per call by an atomic single-statement conditional claim: the oldest
pending job, or a job whose claim lease has expired. The claim pool SHALL be
visibility-scoped by the claimant's resolved Viewer: a job whose
`library_id` is 0 (search jobs carry no titles) stays claimable by ANY
authenticated principal, and a library-backed job SHALL match the conjunct
`(library_id = 0 OR library_id IN (claimant's visible set))` — a job from a
library invisible to the claimant SHALL NOT be handed out. When nothing is
claimable the answer SHALL be `204`. The claim SHALL carry a lease (default
2 minutes, `MELLIFERA_RELAY_LEASE`): a second claimant finds nothing until
the lease expires, and a client posting a result against an expired or
stolen claim SHALL receive `409` and drop the work.

#### Scenario: Exactly one claimant at a time

- **WHEN** two clients (two tabs, two devices) claim concurrently while one
  pending job exists
- **THEN** exactly one receives the descriptor and the other receives `204`
  — no leader election needed, multi-tab is harmless by construction

#### Scenario: An expired lease is re-claimable

- **WHEN** a claim's lease elapses without a result and a later claim arrives
- **THEN** the expired-claim job is handed out again to the new claimant

#### Scenario: Nothing to claim

- **WHEN** a client claims while every job is claimed-and-live, done, or none
  exist
- **THEN** the answer is `204` with no body

#### Scenario: An invisible library's job is never handed out

- **WHEN** a scoped user claims while the only pending enrich job belongs to a library their groups do not carry, and a 0-job (search) also pends
- **THEN** the claim hands out only the 0-job — the invisible library's job stays parked, leaking neither descriptor nor title, and remains claimable by principals whose visible set carries that library

### Requirement: Result endpoint with capped, claim-guarded ingestion

`POST /api/v1/relay/{id}/result` SHALL accept a claimed job's outcome
(`done` with the response, or `failed` with an error) only when the SAME
principal's claim is still live, transitioning the job atomically. At
ingestion the server SHALL RE-CHECK the job's library against the CLAIMANT's
CURRENT Viewer — a claim minted under a principal whose visibility has since
narrowed (logout, login-as-restricted, unbind) SHALL NOT ingest: the answer
is `409` and the job re-enters the claim pool, so titles riding the plan
blob never leak through a stale see-all claim. The request body SHALL be
size-capped (default 2 MiB, `MELLIFERA_RELAY_MAX_BODY`); an over-cap body is
rejected. A completed response SHALL be treated exactly like a
server-fetched body — it goes to the trusted plugin's Convert as the raw
response, and the namespace validator still constrains what lands in the
document. The consuming run's `_stages` fetch entry SHALL record
`executor: "client"` so audit shows where the fetch ran.

#### Scenario: A live claimant posts a successful result

- **WHEN** the claimant posts `{http_status, headers, body, error}` for its
  live claim
- **THEN** the job completes with the stored response, the answer is
  acknowledged, and the body flows to Convert exactly as a server-fetched
  body would — with the namespace validator still governing the document

#### Scenario: A stale or foreign result is refused

- **WHEN** a client posts a result for a job whose claim expired, or whose
  claim a different principal holds
- **THEN** the answer is `409`, nothing is ingested, and the job remains
  claimable (expired) or stays with its holder

#### Scenario: An over-cap result body is rejected

- **WHEN** a result body exceeds the configured cap
- **THEN** the request is rejected before ingestion and the job is untouched

#### Scenario: A narrowed viewer cannot ingest a stale claim

- **WHEN** a claimant whose sessions were revoked (or whose visible set no longer carries the job's library) posts a result for its still-live claim
- **THEN** the ingestion re-check refuses with `409`, the plan blob never reaches the former claimant, and the job returns to the pool for a principal that can still see it
