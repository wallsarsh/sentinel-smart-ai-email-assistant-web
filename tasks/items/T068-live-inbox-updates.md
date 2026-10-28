---
id: T068
title: "Live inbox updates"
phase: P3
status: done
owner: "claude"
type: code
size: S
deps: [T034, T060]
paths: [app/composables/useLive.ts]
refs: [WEB §6]
reqs: [NFR-PERF-01]
updated: 2026-10-28
---

# T068 — Live inbox updates

## Goal
Client subscribes to SSE and updates counts/lists after sync and triage.

## Acceptance
- [x] Reconnect and dedupe tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:27Z claimed by claude
- 2026-10-28 13:30Z Live updates: LiveClient (id dedupe, backoff rebuild, resync after outage) + useLive composable; worker publishes inbox.changed per committed sync page via pg NOTIFY
- 2026-10-28 13:30Z status -> done
