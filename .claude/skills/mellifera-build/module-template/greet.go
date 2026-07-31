package greet

import "strings"

// Greet returns "Hello, <name>." for a non-empty name, "" otherwise.
// Pure: deterministic, no side effects.
func Greet(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	return "Hello, " + name + "."
}

// GreetMany maps Greet over a list, dropping empty results.
func GreetMany(names []string) []string {
	out := make([]string, 0, len(names))
	for _, n := range names {
		if g := Greet(n); g != "" {
			out = append(out, g)
		}
	}
	return out
}
