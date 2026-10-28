---
id: T102
title: "Composer UI"
phase: P6
status: done
owner: "claude"
type: code
size: L
deps: [T101, T065]
paths: [app/pages/inbox/[id]/reply.vue, app/components/composer/]
refs: [MOBILE-ADD §10.2]
reqs: [FR-DRF-02]
updated: 2026-10-28
---

# T102 — Composer UI

## Goal
Tone/intent chips, instruction, streaming text into an editor, placeholder and foreign-detail highlighting, recipients (reply/reply-all), local draft autosave.

## Acceptance
- [x] Stop works immediately
- [x] Autosave restores after reload
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:21Z claimed by claude
- 2026-10-28 15:27Z Composer UI: reply/reply-all recipients from the thread (reply-info API), tone/intent radio chips, instruction, streaming editor with Stop (aborts request), live highlight of placeholders and details not in the thread (shared scan), autosave/restore in localStorage; SSE client; component + axe tests
- 2026-10-28 15:27Z status -> done
