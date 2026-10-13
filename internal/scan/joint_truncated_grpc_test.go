// SPDX-License-Identifier: Apache-2.0

package scan

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/hashicorp/go-plugin"

	"github.com/mellifera/mellifera/internal/store"
	"github.com/mellifera/mellifera/pkg/sdk"
	scannerv1 "github.com/mellifera/mellifera/proto/mellifera/scanner/v1"
)

// Joint-harness constants (fix-truncated-scan-sweep 3.1, the D5 joint tier).
// Both harness sides live in this test, so the magic-cookie pair and the
// PluginSet key are locally agreed constants; the protocol version matches the
// production constant (pkg/sdk serve.go protocolVersion — go-plugin's
// CoreProtocolVersion). Test mode serves over a local listener in-process: no
// subprocess, no external network.
const (
	jointCookieKey   = "MELLIFERA_JOINT_TEST_COOKIE"
	jointCookieValue = "joint-test-secret"
	jointPluginKey   = "scanner"
	jointProtocolVer = 1
)

// grpcBreakScanner is the author-side stub served through ScannerPlugin's REAL
// adapters (server: scannerServer; client: scannerGRPC). Its Scan emits the
// canned files, then reports walkErr as the stream's terminal state — End
// BEFORE the channel close, the D1 producer contract — and its Identify
// answers from canned results keyed by file_id. Over the wire the abort
// reaches the client as a mid-stream gRPC stream error — NEVER io.EOF — so
// scannerGRPC's Recv classification must land it in ScanStream.Err (the exact
// client-path failure the in-package fakes cannot produce).
type grpcBreakScanner struct {
	files    []*scannerv1.DiscoveredFile
	identify map[string]*scannerv1.IdentifyResult
	walkErr  error
}

func (s *grpcBreakScanner) Scan(context.Context, *scannerv1.ScanRequest) (*sdk.ScanStream, error) {
	ch := make(chan *scannerv1.DiscoveredFile, len(s.files))
	ss := sdk.NewScanStream(ch)
	go func() {
		defer close(ch) // after End: the terminal report precedes the Files close
		for _, f := range s.files {
			ch <- f
		}
		ss.End(s.walkErr) // the walk aborted AFTER emitting: a server stream error, not io.EOF
	}()
	return ss, nil
}

func (s *grpcBreakScanner) Identify(_ context.Context,
	req *scannerv1.IdentifyRequest,
) (*scannerv1.IdentifyResult, error) {
	return s.identify[req.GetFile().GetFileId()], nil
}

// serveJointScannerInProcess serves impl through ScannerPlugin's production
// adapters over a go-plugin test-mode connection and dispenses the client the
// core runs in production: ScannerPlugin.GRPCServer registers the real
// scannerServer adapter; ScannerPlugin.GRPCClient returns the real scannerGRPC.
// Shape mirrors pkg/sdk's serveInProcess harness (sdk_test.go); it lives here
// because the joint under test is runScan, not the sdk surface.
func serveJointScannerInProcess(t *testing.T, impl sdk.Scanner) sdk.Scanner {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	reattachCh := make(chan *plugin.ReattachConfig, 1)
	closeCh := make(chan struct{})

	go plugin.Serve(&plugin.ServeConfig{
		HandshakeConfig: plugin.HandshakeConfig{
			ProtocolVersion:  jointProtocolVer,
			MagicCookieKey:   jointCookieKey,
			MagicCookieValue: jointCookieValue,
		},
		Plugins:    plugin.PluginSet{jointPluginKey: &sdk.ScannerPlugin{Impl: impl}},
		GRPCServer: plugin.DefaultGRPCServer,
		Test: &plugin.ServeTestConfig{
			Context:          ctx,
			ReattachConfigCh: reattachCh,
			CloseCh:          closeCh,
		},
	})

	reattach := <-reattachCh
	client := plugin.NewClient(&plugin.ClientConfig{
		HandshakeConfig: plugin.HandshakeConfig{
			ProtocolVersion:  jointProtocolVer,
			MagicCookieKey:   jointCookieKey,
			MagicCookieValue: jointCookieValue,
		},
		Plugins:  plugin.PluginSet{jointPluginKey: &sdk.ScannerPlugin{}},
		Reattach: reattach,
	})
	t.Cleanup(func() {
		cancel()
		client.Kill()
		<-closeCh
	})

	rpcClient, err := client.Client()
	if err != nil {
		t.Fatalf("client.Client: %v", err)
	}
	raw, err := rpcClient.Dispense(jointPluginKey)
	if err != nil {
		t.Fatalf("Dispense(%q): %v", jointPluginKey, err)
	}
	sc, ok := raw.(sdk.Scanner)
	if !ok {
		t.Fatalf("Dispense returned %T, want sdk.Scanner", raw)
	}
	return sc
}

// TestJointTruncatedGRPStreamDoesNotSweep is the joint tier (3.1 / design D5):
// the 2026-10-12 loop the fakes cannot close — a REAL scannerGRPC client over
// a REAL gRPC transport whose server-side Scan emits Show's serial record +
// episodes and then breaks the stream mid-flight (a server stream error, NOT
// io.EOF), wired through runScan via the resolver seam over a real serial
// store. Unit tiers cover each half separately (pkg/sdk's classification tests;
// runScan's gate tests over the in-package fake); this test proves the JOIN:
// the production client's classification of a wire-carried truncation feeds
// the production drain's positive gate, so the sweep never runs on a partial
// pass. Hermetic: go-plugin test mode serves in-process over a local listener.
func TestJointTruncatedGRPStreamDoesNotSweep(t *testing.T) {
	s, r, libID := setupSerialStore(t)
	ctx := context.Background()

	// Prior state: two settled (ready) series — "Show" (re-observed by the
	// truncated pass) and "Ghost.Show" (on disk, but the stream breaks before
	// its record arrives). The seeding pass writes Show's document; promoting
	// its status keeps that document byte-identical for the stale comparison.
	scanSerial(t, s, r, libID, serialLibrary())
	show := seriesRow(t, s, libID, "Show")
	show.Status = "ready"
	if err := s.PutSeries(ctx, show); err != nil {
		t.Fatalf("promote Show: %v", err)
	}
	ghost := store.Series{
		ModuleID: "serial", LibraryID: libID, RelativePath: "Ghost.Show",
		Document:      json.RawMessage(`{"parsed":{"serial_record":true},"ffprobe":{}}`),
		SchemaVersion: 1, Status: "ready",
	}
	if err := s.PutSeries(ctx, ghost); err != nil {
		t.Fatalf("seed Ghost.Show: %v", err)
	}

	// The truncated pass: the SAME emission serialLibrary() stamps, served
	// through the production adapters, whose walk aborts after emitting.
	lib := serialLibrary()
	stub := &grpcBreakScanner{
		files:    lib.files,
		identify: lib.identify,
		walkErr:  errors.New("walk aborted mid-stream"),
	}
	sc := serveJointScannerInProcess(t, stub)

	notify := &recordingNotifier{store: s}
	rr := &recordingResolver{scanner: sc}
	res, err := runScan(context.Background(), s, r, rr.resolve, passthroughEnricher(), notify.notify, libID)
	if err != nil {
		t.Fatalf("runScan: %v", err) // production behavior: the scan reports success
	}

	// The stream carried Show's full emission before the break — the pass is
	// genuinely partial, so the no-sweep assertions below cannot pass vacuously
	// on a harness that emitted nothing.
	if res.Discovered != 3 || res.Persisted != 3 {
		t.Fatalf("partial pass discovered=%d persisted=%d, want 3/3 "+
			"(Show record + 2 episodes over the wire)",
			res.Discovered, res.Persisted)
	}
	// The warning names the incomplete stream AND carries the producer's error
	// text — proving the server's abort traversed the wire and scannerGRPC
	// classified it as a terminal report (never a clean end-of-stream).
	found := false
	for _, w := range res.Warnings {
		if strings.Contains(w, "scan: stream ended before completing") &&
			strings.Contains(w, "walk aborted mid-stream") {
			found = true
		}
	}
	if !found {
		t.Errorf("warnings %v do not name the incomplete stream "+
			"(truncation warning missing or stripped of the producer error)",
			res.Warnings)
	}
	// B7 analog: a half-drained pass never signals the queue.
	if n := notify.count(); n != 0 {
		t.Errorf("Notify called %d times on a truncated gRPC stream, want 0", n)
	}
	// Show: re-observed over the wire with unchanged facts — stays ready.
	if got := seriesRow(t, s, libID, "Show").Status; got != "ready" {
		t.Errorf("re-observed series %q status = %q, want ready", "Show", got)
	}
	// Ghost.Show: never observed. A truncated stream is not evidence of a
	// vanished directory — the sweep must NOT have run behind the production
	// client's classification (the incident: 19 live rows tombstoned).
	if got := seriesRow(t, s, libID, "Ghost.Show").Status; got != "ready" {
		t.Errorf("unobserved series %q status = %q, want ready — the sweep ran on a mid-stream "+
			"gRPC failure (scannerGRPC classified the server stream error as a clean end)", "Ghost.Show", got)
	}
}
