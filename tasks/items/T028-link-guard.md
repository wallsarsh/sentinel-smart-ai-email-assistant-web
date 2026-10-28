---
id: T028
title: "Link guard"
phase: P1
status: todo
owner: ""
type: code
size: S
deps: [T005]
paths: [shared/link-guard.ts]
refs: [MOBILE-ADD §7.2]
reqs: [NFR-SEC-08]
updated: 2026-10-28
---

# T028 — Link guard

## Goal
Scheme allow-list and warnings for IP hosts, punycode, userinfo, http, text/href mismatch.

## Acceptance
- [ ] Unit tests mirror mobile fixtures
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
