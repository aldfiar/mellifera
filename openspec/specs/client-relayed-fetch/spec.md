# client-relayed-fetch Specification

## Purpose
Client-relayed fetch: when the server cannot reach an upstream (a network-class fetch failure) but an authenticated client can, the fetch is handed to a durable relay queue that authenticated browser clients claim and execute — a transport change invisible to plugins, so enrichment and identify search work from a blocked server.

## Requirements

### Requirement: Fetch failure classification

Every failure at the enrichment fetch seam SHALL be classified into the closed
set `network | upstream | protocol | spec`: `network` — no HTTP response
arrived (DNS/host-not-found, dial refused or unreachable, TLS handshake,
context deadline); `upstream` — a response arrived (any status, including
4xx/5xx: the server demonstrably reaches the host); `protocol` — body
read/decode failures; `spec` — request validation failures (method,
substitution, unresolvable variables). Only `network` is relay-eligible; the
other classes remain ordinary chain failures. Each `_stages` fetch entry SHALL
carry the machine `class` beside the free-text error, and a fetch-failure
ledger reason SHALL carry the class token — human text stays alongside, never
instead.

#### Scenario: Network-class failure is the relay-eligible one

- **WHEN** a fetch attempt dies with DNS failure, connection refused, a TLS
  handshake error, or a context deadline — and separately when an upstream
  answers 503, when the body read breaks mid-stream, and when the request spec
  names an unsubstitutable placeholder
- **THEN** the classifications are `network`, `upstream`, `protocol`, and
  `spec` respectively, and only the `network` case is eligible for relay
  handoff

#### Scenario: Stages and ledger reasons carry the machine class

- **WHEN** a run's fetch stage fails with a classified error
- **THEN** the run's `_stages` entry records the machine `class` token beside
  the human error text, and the ledger reason written for the failure carries
  the same class token

#### Scenario: A proxy answering for a blocked host reads as upstream

- **WHEN** a transparent proxy answers 503 on behalf of a blocked host
- **THEN** the class is `upstream` and the failure never relays (accepted v1
  tradeoff — the operator sees it in the ledger reason)

### Requirement: Deferred runs hand off to the relay queue

A `network`-class failure on a run's primary spec OR any extra spec SHALL
convert the run to a new deferred outcome — neither failed nor succeeded: the
whole request plan (primary + extras, positional, the shape Convert already
consumes) SHALL be handed to the relay queue as one durable job, and the
in-memory retry loop SHALL short-circuit on a deferred run (no backoff, no
server-side retries). With the relay disabled, a network-class failure SHALL
keep today's behavior exactly (a chain failure into the normal retry and
ledger paths).

#### Scenario: A network-class primary failure defers the whole plan

- **WHEN** a source run's primary fetch fails with a `network`-class error and
  the relay is enabled
- **THEN** the run ends deferred, one relay job carries the primary and the
  extras positionally, and the retry loop runs no further attempts

#### Scenario: A network-class extra failure defers too

- **WHEN** an extra spec of an otherwise-successful plan fails with a
  `network`-class error
- **THEN** the run defers and the job carries the same plan (the extra's slot
  marked unfetched), rather than soft-failing the entry server-side

#### Scenario: Relay disabled keeps today's behavior

- **WHEN** the relay is disabled and a fetch fails with a `network`-class
  error
- **THEN** the run fails exactly as before the change — retries, ledger, and
  lifecycle untouched

### Requirement: Relay jobs are durable and server-authored

Relay jobs SHALL persist in a dedicated control table (results are not
derivable from documents) and survive a restart. A job's descriptor SHALL be
fully server-authored: the request specs after variable substitution and after
server-secret resolution — the client never sees a template or a placeholder
and cannot influence method, URL, or headers. The SSRF invariant SHALL hold by
construction: claim hands out bytes for a job id, the result endpoint accepts
bytes back keyed by the job id only, and no client input ever shapes what the
server fetches.

#### Scenario: The descriptor arrives fully substituted

- **WHEN** an authenticated client claims a job whose plugin spec carried
  variables and a server-resolved secret
- **THEN** the descriptor's method, URL, and headers are final resolved values
  with no template syntax and no placeholder, and the client cannot alter them

#### Scenario: Jobs survive a restart

- **WHEN** the core restarts with relay jobs pending
- **THEN** the jobs are still claimable and their stored results intact — no
  in-memory-only relay state exists

### Requirement: Claim endpoint with exactly one claimant

`POST /api/v1/relay/claim` SHALL be open to any authenticated principal
(admin and paired device tokens today) and SHALL hand out at most one job per
call by an atomic single-statement conditional claim: the oldest pending job,
or a job whose claim lease has expired. When nothing is claimable the answer
SHALL be `204`. The claim SHALL carry a lease (default 2 minutes,
`MELLIFERA_RELAY_LEASE`): a second claimant finds nothing until the lease
expires, and a client posting a result against an expired or stolen claim
SHALL receive `409` and drop the work.

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

### Requirement: Result endpoint with capped, claim-guarded ingestion

`POST /api/v1/relay/{id}/result` SHALL accept a claimed job's outcome
(`done` with the response, or `failed` with an error) only when the SAME
principal's claim is still live, transitioning the job atomically. The
request body SHALL be size-capped (default 2 MiB, `MELLIFERA_RELAY_MAX_BODY`);
an over-cap body is rejected. A completed response SHALL be treated exactly
like a server-fetched body — it goes to the trusted plugin's Convert as the
raw response, and the namespace validator still constrains what lands in the
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

### Requirement: Relay completion re-derives the pair

When an enrichment (`purpose: "enrich"`) job completes successfully, the
pair's ledger row SHALL clear and the library SHALL be notified so derivation
re-runs it. The re-derived run SHALL consult the relay cache first: a `done`,
unconsumed job for the same (row, plugin) whose request plan matches SHALL
feed its stored response into Convert exactly as a server fetch and be marked
consumed; a plan mismatch (the document changed mid-flight) SHALL miss the
cache and fall through to a normal server fetch — safe degradation.

#### Scenario: The stored response lands as the namespace

- **WHEN** the client's result completes the job and the notified derivation
  re-runs the pair with an unchanged plan
- **THEN** the run consumes the stored response, Convert/Merge proceed
  normally, the namespace lands, and the job is consumed — no second fetch of
  the same URL happens

#### Scenario: A plan mismatch degrades to a normal fetch

- **WHEN** the re-derived pair's rebuilt request plan differs from the done
  job's plan
- **THEN** the cache misses, the run fetches server-side as usual, and the
  stale job is not consumed into the document

### Requirement: Relay give-up after three rounds

A relay round is one handed-off fetch plus its ledger row. After three relay
rounds for a (row, plugin) pair the ledger SHALL record terminal `exhausted`
with the standard doubling schedule — the pair cools long, and the item
settles `ready` WITHOUT the source's namespace (honest absence). An explicit
re-enrichment or a cooldown lapse reopens the pair exactly as any other
exhausted source.

#### Scenario: Three failed relay rounds settle the item honestly

- **WHEN** three consecutive relay jobs for a pair fail (no client claims
  them, or results report failure)
- **THEN** the ledger row becomes terminal `exhausted` with the standard
  doubling, the item settles `ready` without the namespace, and no further
  relay jobs are created for the pair until it reopens

### Requirement: Credential redaction on relayed fetches

A relayed descriptor necessarily carries the resolved server secret in its URL
(accepted, narrowed exposure: descriptors go only to authenticated
principals). Everywhere else the key-bearing URL SHALL be redacted: logs,
`_stages` error text, and ledger reasons SHALL carry no fetch URL verbatim
when it embeds a credential.

#### Scenario: The ledger reason never carries the keyed URL

- **WHEN** a relayed pair's handoff and its later exhaustion write ledger rows
- **THEN** the reasons carry the class token and redacted URL forms — the
  resolved secret is not readable from the ledger, the stages, or the logs

### Requirement: Search rides the relay

An identify-search fetch that fails with a `network`-class error SHALL enqueue
a relay job with `purpose: "search"` (no ledger row — a search has no
(row, plugin) pair). The admin search endpoint SHALL hold the request and poll
the job (≤60 s budget) before answering: a completed job feeds its stored
response to the source's result conversion; a failed, expired, or
budget-exceeded job answers the upstream error the endpoint answers today. The
identify picker thereby works from a blocked server while the SPA's relay loop
executes the job concurrently.

#### Scenario: Identify search completes over the relay

- **WHEN** the server's search fetch fails with a `network`-class error, the
  search job is enqueued, and a client executes it within the budget
- **THEN** the held search request answers with the candidates converted from
  the stored response

#### Scenario: An unclaimed search job times out to the upstream error

- **WHEN** no client claims or completes the search job within the 60 s
  budget
- **THEN** the held request answers the same upstream error as a failed
  server-side search does today, with retry disabled

### Requirement: Relay configuration with safe fallback

The relay knobs — the claim lease (`MELLIFERA_RELAY_LEASE`, default 2
minutes) and the result body cap (`MELLIFERA_RELAY_MAX_BODY`, default 2 MiB)
— SHALL be env-overridable. A missing, empty, or malformed value SHALL fall
back to the default and log a warning; startup SHALL NOT abort on a relay
knob.

#### Scenario: Malformed relay knob falls back

- **WHEN** a `MELLIFERA_RELAY_*` env var is set to a malformed value at
  startup
- **THEN** the default is used, a warning is logged, and the relay starts
  normally
