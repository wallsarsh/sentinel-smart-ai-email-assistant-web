---
id: T026
title: "Audit log and account lockout"
phase: P1
status: todo
owner: ""
type: code
size: S
deps: [T023]
paths: [server/audit/]
refs: [WEB §8]
reqs: [NFR-SEC-07]
updated: 2026-10-28
---

# T026 — Audit log and account lockout

## Goal
Append-only audit of logins, MFA, account connect/remove, sends, exports, wipes (no content); progressive lockout.

## Acceptance
- [ ] Events listed in WEB §8 recorded
- [ ] Audit entries viewable by the user (API)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
