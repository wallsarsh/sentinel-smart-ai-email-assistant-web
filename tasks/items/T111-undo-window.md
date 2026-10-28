---
id: T111
title: "Undo window"
phase: P6
status: done
owner: "claude"
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
- [x] Exactly one delivery (test)
- [x] Undo/revoke and race tests
- [x] Notification if cancelled
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 16:26Z claimed by claude
- 2026-10-28 16:38Z Undo window: server-side scheduler (survives closed tabs/restarts), releases only at release time via the gate's atomic claim - exactly one delivery across concurrent instances, Undo/release races (20 interleavings), expired/session-ended authorizations cancelled and the user notified once (SSE send.status), no retries; container wires gmail/graph/smtp senders; Nitro plugin starts the loop (web process only)
- 2026-10-28 16:38Z status -> done
