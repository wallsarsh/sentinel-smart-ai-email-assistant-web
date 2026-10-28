---
id: T024
title: "TOTP two-factor and recovery codes"
phase: P1
status: todo
owner: ""
type: code
size: M
deps: [T023]
paths: [server/auth/mfa.ts, server/api/auth/mfa/]
refs: [WEB §8]
reqs: [NFR-SEC-05]
updated: 2026-10-28
---

# T024 — TOTP two-factor and recovery codes

## Goal
TOTP enrolment/verification, single-use recovery codes, step-up check helper.

## Acceptance
- [ ] Enrol, verify, disable flows
- [ ] Recovery codes hashed and single-use
- [ ] Step-up required for sensitive actions
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
