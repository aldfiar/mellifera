package tv.mellifera.state

/**
 * The pure playback flow machine (D1): `reduce(state, event)` with the
 * ~15-case truth table over Idle | Starting | Active | Dead | Failed.
 * Owned by task 5.5 — this file is the machine's fixed home.
 */
