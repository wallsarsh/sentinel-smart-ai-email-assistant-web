---
id: T106
title: "GmailMailSender"
phase: P6
status: todo
owner: ""
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
- [ ] Recording-network tests
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
