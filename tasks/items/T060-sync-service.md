---
id: T060
title: "Sync service"
phase: P3
status: done
owner: "claude"
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
- [x] Crash replays a page but never skips one (test)
- [x] Failure of one account never blocks others
- [x] Sanitized HTML stored
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:10Z claimed by claude
- 2026-10-28 13:13Z Sync service: per-folder cursors persisted with each page in one transaction (replay-safe), initial window, deletions, sanitized html, in-process one-sync-per-account, syncUser with bounded concurrency and failure isolation
- 2026-10-28 13:13Z status -> done
