---
id: T045
title: "GmailMailProvider: read and sync"
phase: P2
status: done
owner: "claude"
type: code
size: L
deps: [T040, T044, T029]
paths: [server/mail/gmail/]
refs: [MOBILE-ADD §4.3]
reqs: [FR-READ-01]
updated: 2026-10-28
---

# T045 — GmailMailProvider: read and sync

## Goal
History-based incremental sync, batch message get, threads, labels to folders, cursor handling and full-resync on 404.

## Acceptance
- [x] Fixture-driven tests with recorded responses
- [x] Contract tests pass
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 12:48Z claimed by claude
- 2026-10-28 12:50Z Gmail read/sync: labels->roles, history incremental sync with full resync on 404, paged initial listing, full-format parse, fake Gmail API + contract suite
- 2026-10-28 12:50Z status -> done
