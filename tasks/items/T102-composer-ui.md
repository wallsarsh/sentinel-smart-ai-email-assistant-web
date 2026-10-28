---
id: T102
title: "Composer UI"
phase: P6
status: todo
owner: ""
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
- [ ] Stop works immediately
- [ ] Autosave restores after reload
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
