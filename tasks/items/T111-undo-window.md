---
id: T111
title: "Undo window"
phase: P6
status: todo
owner: ""
type: code
size: M
deps: [T110]
paths: [server/mail/send/scheduler.ts, app/components/send/UndoBar.vue]
refs: [MOBILE-ADD §9.4]
reqs: [FR-SND-04]
updated: 2026-10-28
---

# T111 — Undo window

## Goal
Server-side delayed submit (default 5 s, 0-30) so a closed tab still honours the decision; Undo revokes; leaving the page does not send early or silently cancel unless the user chooses; exactly one send.

## Acceptance
- [ ] Exactly one delivery (test)
- [ ] Undo/revoke and race tests
- [ ] Notification if cancelled
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
