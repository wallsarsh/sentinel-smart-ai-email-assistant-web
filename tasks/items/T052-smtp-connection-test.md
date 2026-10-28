---
id: T052
title: "SMTP connection test"
phase: P2
status: done
owner: "claude"
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
- [x] Never issues MAIL FROM (test with fake server)
- [x] Clear error mapping
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:00Z claimed by claude
- 2026-10-28 13:01Z SMTP connection test via nodemailer verify(): TLS+auth only, verified against fake server that no MAIL/RCPT/DATA is issued; private hosts refused; error mapping
- 2026-10-28 13:01Z status -> done
