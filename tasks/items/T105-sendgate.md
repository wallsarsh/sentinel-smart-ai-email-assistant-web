---
id: T105
title: "SendGate"
phase: P6
status: done
owner: "claude"
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
- [x] Expired/used/tampered/revoked all refused (tests)
- [x] Content hash ignores recipient order and case only
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:37Z claimed by claude
- 2026-10-28 15:44Z SendGate: DB-backed single-use authorization (nonce hash only, content sealed in secret store), bound to confirming session and content hash (recipient order/case-insensitive only), 2-min validity after the undo release, atomic claim (concurrent redeem -> one winner), refusals incl. expired/used/revoked/tampered/session-ended/daily-limit/step-up/placeholders; migration 0004
- 2026-10-28 15:44Z status -> done
