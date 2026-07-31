package greet

import "testing"

func TestGreet(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"plain", "World", "Hello, World."},
		{"trimmed", "  World  ", "Hello, World."},
		{"empty", "", ""},
		{"whitespace_only", "   ", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Greet(c.in); got != c.want {
				t.Errorf("Greet(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

func TestGreetMany(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want []string
	}{
		{"mixed", []string{"Ana", "", "  Bo  "}, []string{"Hello, Ana.", "Hello, Bo."}},
		{"all_empty", []string{"", "  "}, []string{}},
		{"nil", nil, []string{}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := GreetMany(c.in)
			if len(got) != len(c.want) {
				t.Fatalf("GreetMany(%v) = %v, want %v", c.in, got, c.want)
			}
			for i := range got {
				if got[i] != c.want[i] {
					t.Errorf("GreetMany(%v)[%d] = %q, want %q", c.in, i, got[i], c.want[i])
				}
			}
		})
	}
}
