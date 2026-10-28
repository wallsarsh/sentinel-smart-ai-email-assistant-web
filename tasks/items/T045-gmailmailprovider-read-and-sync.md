---
id: T045
title: "GmailMailProvider: read and sync"
phase: P2
status: todo
owner: ""
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
- [ ] Fixture-driven tests with recorded responses
- [ ] Contract tests pass
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
