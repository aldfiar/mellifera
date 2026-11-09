# Spec Delta

## ADDED Requirements

### Requirement: Honest file-missing playback surface

The item page SHALL treat a playback descriptor whose state reads `missing` (the file-missing answer, `state_reason` `file_missing`) as a not-playable answer rendered honestly: an explicit file-missing banner IN PLACE of the player mount — no video element, no raw-original source, never a spinner, never a codec or decoding claim — carrying NO retry affordance (nothing failed that a retry could fix — the file is gone) and sending no playback-event beacon (no playback is attempted). The banner's wording SHALL derive from the served state value itself, never a client-side guess about why play failed. The client's descriptor type SHALL grow the additive `file_missing` state-reason value as a union member, so the branch is exhaustive and type-checked — never a string cast. Every other descriptor answer — hls, a native direct, `preparing`, `unsupported`, `failed` — SHALL keep today's surface byte-identical: the missing branch adds one state and changes no other.

#### Scenario: Missing file renders the honest banner

- **WHEN** the descriptor for a video item answers state `missing` with `state_reason` `file_missing`
- **THEN** the item page renders the file-missing banner in the player's place — no video element mounts, no retry affordance renders, and no playback event is sent

#### Scenario: Every other answer keeps today's surface

- **WHEN** the descriptor answers hls, a native direct, `preparing`, `unsupported`, or `failed`
- **THEN** the page's player surface is unchanged — the missing state is a new branch, not a rework of the existing ones
