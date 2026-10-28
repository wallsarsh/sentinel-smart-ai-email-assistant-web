---
id: T091
title: "Triage service"
phase: P5
status: todo
owner: ""
type: code
size: L
deps: [T080, T081, T075, T060, T090]
paths: [server/triage/service.ts]
refs: [MOBILE-ADD §5.3]
reqs: [FR-TRI-02]
updated: 2026-10-28
---

# T091 — Triage service

## Goal
Batch triage of new mail through the triage route, storing category/importance/urgency/needsReply/summary/actions; VIP floor; user corrections win; batch splitting on truncation.

## Acceptance
- [ ] Fake-router tests incl. missing/duplicate ids
- [ ] Excluded accounts never reach the router
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
