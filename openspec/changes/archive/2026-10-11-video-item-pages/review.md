# Gate record — video-item-pages

## GATE 2

**Date:** 2026-10-11
**Reviewer verdict:** PASS (per requirement: Item detail view PASS; Video playback in the SPA PASS; Embedded build carries the video item pages PASS).

Evidence: reviewer re-ran all 13 probes itself (5 box-linked ids + 8 non-box scenarios), full web suite 150/150 across 11 files, tsc + eslint clean, fresh (`-count=1`) Go joint E2E green (`TestVideoItemPagesJointE2E`, real serial-scanner subprocess + real ffprobe). `wf change check` green (requirements=3 probe_backed=3 unprobeable=0 gaps=0). Regression genuineness verified by reasoning over the diff's minus side: on pre-change `media_type === "video"` gates, the production-shaped serial fixture fails three independent assertions (playback query never enabled → no Player region; photo lane → no "Media stage"; hidden resume row → no "Play from the start.").

Standards axis: no violations. Two notes, non-blocking: (1) P3 nit — api.ts:584 "Exported pure for tests" comment; tests reach the predicates through the page, not by direct import. (2) Pre-existing, not introduced here — ItemDetail.tsx 875 lines (over the 500-line hard limit before this change; the spec-mandated fold added +36); component split is a separate refactor change.

Commit set hygiene (reviewer guidance, followed): implementation commit = 6 web/src files + internal/itest/qa_video_item_pages_test.go + docs/.source_map.json; archive commit = the archived change folder + living spec updates. The dist commit `25c1156` was authorized at GATE 1 (box 3.1's probe asserts committed dist). Git-toplevel dirt (.DS_Store, .idea/, .tmp/, coturn/) predates this change and is excluded.

**Human archive approval:** approved 2026-10-11
