---
id: T062
title: "Inbox query API"
phase: P3
status: todo
owner: ""
type: code
size: M
deps: [T060]
paths: [server/api/inbox/]
refs: [WEB §6]
reqs: [FR-READ-05]
updated: 2026-10-28
---

# T062 — Inbox query API

## Goal
Segments (Needs reply, Actions, Important, FYI, Newsletters, All) with counts, account filter, cursor pagination.

## Acceptance
- [ ] Counts correct (test)
- [ ] p95 < 150 ms on 50k messages locally
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
