---
id: T026
title: "Audit log and account lockout"
phase: P1
status: done
owner: "claude-sonnet-5-5"
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
- [x] Events listed in WEB §8 recorded
- [x] Audit entries viewable by the user (API)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:39Z claimed by claude-sonnet-5-5
- 2026-10-28 10:41Z Audit log (typed events, ids/codes only, truncation, per-user, own-log API /api/account/audit) wired into auth and MFA routes; progressive lockout 5/10/15 failures (1/5/30 min) answering exactly like a wrong password; success resets
- 2026-10-28 10:41Z status -> done
