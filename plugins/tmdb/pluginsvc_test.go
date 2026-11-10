package main

import (
	"testing"

	pluginv1 "github.com/mellifera/mellifera/proto/mellifera/plugin/v1"
)

// TestHandshakeDeclaresRequiredSecrets pins the domain Handshake contract:
// identity "tmdb", the ONE metadata_source capability with id "default", and
// required_secrets exactly ["api_key"] (proto field 6 — this is its first
// real user; the core turns the declaration into SERVER-side AuthContext
// resolution, the key never ships into the plugin).
func TestHandshakeDeclaresRequiredSecrets(t *testing.T) {
	resp, err := (&pluginServiceImpl{}).Handshake(t.Context(), &pluginv1.HandshakeRequest{})
	if err != nil {
		t.Fatalf("Handshake: unexpected error: %v", err)
	}
	if resp.PluginId != "tmdb" {
		t.Errorf("PluginId = %q, want %q", resp.PluginId, "tmdb")
	}
	if n := len(resp.Capabilities); n != 1 {
		t.Fatalf("len(Capabilities) = %d, want 1", n)
	}
	cap := resp.Capabilities[0]
	if cap.Type != "metadata_source" {
		t.Errorf("Type = %q, want %q", cap.Type, "metadata_source")
	}
	if cap.Id != "default" {
		t.Errorf("Id = %q, want %q", cap.Id, "default")
	}
	if len(cap.RequiredSecrets) != 1 || cap.RequiredSecrets[0] != "api_key" {
		t.Errorf("RequiredSecrets = %v, want [api_key]", cap.RequiredSecrets)
	}
}
