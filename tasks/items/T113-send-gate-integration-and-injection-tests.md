---
id: T113
title: "Send-gate integration and injection tests"
phase: P6
status: todo
owner: ""
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
- [ ] Runs in CI
- [ ] Hostile email corpus included
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
