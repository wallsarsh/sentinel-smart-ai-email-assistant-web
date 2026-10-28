---
id: T106
title: "GmailMailSender"
phase: P6
status: done
owner: "claude"
type: code
size: M
deps: [T105, T046]
paths: [server/mail/send/gmail.ts]
refs: [MOBILE-ADD §9.4]
reqs: [FR-SND-02]
updated: 2026-10-28
---

# T106 — GmailMailSender

## Goal
Update draft with approved content then drafts.send; never retries automatically; send record state machine.

## Acceptance
- [x] Recording-network tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:45Z claimed by claude
- 2026-10-28 15:51Z GmailMailSender: GET draft (thread) -> PUT approved content -> single POST drafts/send; 4xx failed, 5xx/dropped unknown, refused-connection failed, 401 reconnect, no retry, redeemed proof single-use; send-record state machine; reconcile via Sent search never resubmits; recording-network tests
- 2026-10-28 15:51Z status -> done
