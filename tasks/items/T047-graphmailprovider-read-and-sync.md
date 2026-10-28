---
id: T047
title: "GraphMailProvider: read and sync"
phase: P2
status: todo
owner: ""
type: code
size: L
deps: [T040, T044, T029]
paths: [server/mail/graph/]
refs: [MOBILE-ADD §4.4]
reqs: [FR-READ-02]
updated: 2026-10-28
---

# T047 — GraphMailProvider: read and sync

## Goal
Delta query per folder, message fetch with body, conversation threads, delta token expiry handling.

## Acceptance
- [ ] Fixture-driven tests
- [ ] Contract tests pass
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
