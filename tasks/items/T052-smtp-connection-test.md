---
id: T052
title: "SMTP connection test"
phase: P2
status: todo
owner: ""
type: code
size: S
deps: [T050]
paths: [server/mail/send/smtp-test.ts]
refs: [MOBILE-ADD §4.5]
reqs: [FR-ACC-03]
updated: 2026-10-28
---

# T052 — SMTP connection test

## Goal
Authenticate-only SMTP test (no message sent) used during IMAP setup; lives in the send module.

## Acceptance
- [ ] Never issues MAIL FROM (test with fake server)
- [ ] Clear error mapping
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
