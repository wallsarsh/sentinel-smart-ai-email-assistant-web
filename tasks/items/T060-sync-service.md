---
id: T060
title: "Sync service"
phase: P3
status: todo
owner: ""
type: code
size: L
deps: [T045, T047, T050, T021]
paths: [server/sync/]
refs: [MOBILE-ADD §4.5]
reqs: [FR-READ-04]
updated: 2026-10-28
---

# T060 — Sync service

## Goal
Per-account incremental sync with pages stored atomically with their cursor, initial window, deletions, bounded concurrency, one sync per account at a time.

## Acceptance
- [ ] Crash replays a page but never skips one (test)
- [ ] Failure of one account never blocks others
- [ ] Sanitized HTML stored
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
