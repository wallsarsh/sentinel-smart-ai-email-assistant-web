---
id: T105
title: "SendGate"
phase: P6
status: todo
owner: ""
type: code
size: M
deps: [T005, T022]
paths: [server/mail/send/send-gate.ts]
refs: [MOBILE-ADD §9.4, WEB §7]
reqs: [FR-SND-03]
updated: 2026-10-28
---

# T105 — SendGate

## Goal
Single-use, short-lived authorization bound to a hash of the exact content and the user session; refusal reasons; revocation; daily limit; step-up/WebAuthn-or-password re-auth when required.

## Acceptance
- [ ] Expired/used/tampered/revoked all refused (tests)
- [ ] Content hash ignores recipient order and case only
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
