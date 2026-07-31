// Package greet is a TEMPLATE module illustrating Mellifera's AI-navigable
// structure. Copy this directory to start a new module and rename "greet".
//
// RESPONSIBILITY
//   Produce a greeting string from a name. (Replace with your module's job.)
//
// PUBLIC API  (≤8 exported symbols — see .claude/skills/mellifera-build)
//   func Greet(name string) string
//   func GreetMany(names []string) []string
//
// INVARIANTS
//   - Pure: no I/O, no global state, deterministic.
//   - Empty/whitespace name → "" (no panic).
//
// Write this contract BEFORE implementation. It is the file an AI agent reads
// first to understand the whole module.
package greet
