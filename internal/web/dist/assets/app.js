// SPDX-License-Identifier: Apache-2.0
// Mellifera SPA placeholder asset.
//
// This is a hand-written Phase-1 placeholder so the Go gate has a real,
// committed /assets/app.js for `go:embed all:dist` (Task 11) to embed and for
// the AC-6 immutable-cache verify probe to hit. It contains NO React, requires
// NO build step, and is replaced by the real Vite/React bundle in Phase 2
// (`make web-build` -> web/dist/).
//
// Intentionally a no-op: the placeholder landing page (../index.html) renders
// server-side; the React app mounts into #root here once Phase 2 ships.
(function () {
  "use strict";
  // No-op placeholder. The Phase-2 React entry replaces this file.
})();
