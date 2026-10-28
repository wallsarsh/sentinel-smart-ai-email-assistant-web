---
id: T091
title: "Triage service"
phase: P5
status: done
owner: "claude"
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
- [x] Fake-router tests incl. missing/duplicate ids
- [x] Excluded accounts never reach the router
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:54Z claimed by claude
- 2026-10-28 15:01Z Triage service: pre-filter gate, batched structured calls through router (triage/repair routes), VIP floor, user correction wins, invented/duplicate ids dropped, missing ids retried alone, batch split on truncation/malformed, unclassified fallback, failures keep progress and leave rest queued, due dates in user's zone, privacy settings applied
- 2026-10-28 15:01Z status -> done
