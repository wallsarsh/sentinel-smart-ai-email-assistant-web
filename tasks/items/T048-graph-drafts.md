---
id: T048
title: "Graph drafts"
phase: P2
status: todo
owner: ""
type: code
size: M
deps: [T047, T041]
paths: [server/mail/graph/drafts.ts]
refs: [MOBILE-ADD §4.4]
reqs: [FR-DRF-03]
updated: 2026-10-28
---

# T048 — Graph drafts

## Goal
createReply drafts with body merge, update and delete, idempotency by internet message id.

## Acceptance
- [ ] No duplicate drafts on retry
- [ ] Only Sentinel-created drafts touched
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
