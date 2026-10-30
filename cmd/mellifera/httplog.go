// SPDX-License-Identifier: Apache-2.0
package main

import (
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// requestLog is the HTTP observability seam: one INFO line per request —
// method, path, status, bytes, duration, remote IP, user agent. It exists
// because client-side playback failures are otherwise invisible server-side:
// the media surface and the SPA assets log nothing on their own, and "did
// the TV fetch the new bundle, which segments did it request, with what UA
// and what status" is the first question every playback incident asks (the
// 2026-10-30 TV failure left zero server-side evidence).
//
// The query string is NEVER logged — media tokens ride it. The path alone
// identifies the surface (/api/*, /media/*, /assets/*, SPA shell).
func requestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		if rec.status == 0 {
			rec.status = http.StatusOK
		}
		slog.Info("http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"bytes", rec.bytes,
			"ms", time.Since(start).Milliseconds(),
			"ip", remoteIP(r),
			"ua", r.UserAgent(),
		)
	})
}

// statusRecorder captures the status code and byte count of the wrapped
// handler's response. Unwrap lets net/http's ResponseController reach the
// underlying writer (range requests, flushes) through the wrapper.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *statusRecorder) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *statusRecorder) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusRecorder) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytes += n
	return n, err
}

// remoteIP strips the port from RemoteAddr (host:port or [host]:port).
func remoteIP(r *http.Request) string {
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i > 0 {
		host = host[:i]
	}
	return host
}
