---
id: T012
title: "Send-gate architecture check (JS)"
phase: P0
status: todo
owner: ""
type: code
size: S
deps: [T001]
paths: [tools/send-gate-check.mjs]
refs: [WEB §7, MOBILE-ADD §9.4]
reqs: [NFR-SEC-10]
updated: 2026-10-28
---

# T012 — Send-gate architecture check (JS)

## Goal
Script that fails CI if send primitives (SMTP send, Gmail drafts.send/messages.send, Graph sendMail/send) appear outside `server/mail/send/`, or if that module is imported outside the confirmation API route and DI root, or from AI/jobs/triage/brief/notification code.

## Acceptance
- [ ] Fixtures with violations make it fail
- [ ] Wired into `npm run check` and CI
- [ ] Allow-list file requires security approval
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
