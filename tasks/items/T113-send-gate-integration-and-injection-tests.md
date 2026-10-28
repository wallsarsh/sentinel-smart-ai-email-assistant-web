---
id: T113
title: "Send-gate integration and injection tests"
phase: P6
status: done
owner: "claude"
type: test
size: M
deps: [T111]
paths: [tests/send-gate/]
refs: [WEB §7, MOBILE-TEST §4]
reqs: [NFR-SEC-10]
updated: 2026-10-28
---

# T113 — Send-gate integration and injection tests

## Goal
Full pipeline with a recording network and fake IMAP/SMTP: zero sends without confirmation, one with it, none after undo, tampering refused, injection fixtures pass.

## Acceptance
- [x] Runs in CI
- [x] Hostile email corpus included
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 16:44Z claimed by claude
- 2026-10-28 16:53Z Send-gate integration: full pipeline (sync, triage, obedient-model drafting, save draft, confirm, scheduler) over a recording Gmail network with 12 hostile emails (zero sends/authorizations without the user), exactly one send with exactly the confirmed content, none after Undo, tampering/replay/foreign authorization/altered sealed content refused, failures never retried, injected details flagged on the confirmation screen, envelope integrity per hostile mail, static send-gate check as a test (runs in CI via npm run check)
- 2026-10-28 16:53Z status -> done
