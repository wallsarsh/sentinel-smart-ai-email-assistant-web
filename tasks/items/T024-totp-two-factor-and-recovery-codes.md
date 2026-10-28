---
id: T024
title: "TOTP two-factor and recovery codes"
phase: P1
status: done
owner: "claude-sonnet-5-5"
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
- [x] Enrol, verify, disable flows
- [x] Recovery codes hashed and single-use
- [x] Step-up required for sensitive actions
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:36Z claimed by claude-sonnet-5-5
- 2026-10-28 10:37Z RFC 6238 TOTP (verified against RFC vectors, ±1 step), enrol/confirm/disable, 10 hashed single-use recovery codes, signed 5-minute login challenge, session step-up (10 min) + requireStepUp helper; secret encrypted in the secret store; API routes wired (login returns mfaRequired+challenge)
- 2026-10-28 10:37Z status -> done
