---
id: T047
title: "GraphMailProvider: read and sync"
phase: P2
status: done
owner: "claude"
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
- [x] Fixture-driven tests
- [x] Contract tests pass
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 12:51Z claimed by claude
- 2026-10-28 12:53Z Graph read/sync: well-known folders, delta paging with removals, expired-token restart, cursor host validation, text bodies, threads by conversationId; fake Graph API + contract suite
- 2026-10-28 12:53Z status -> done
