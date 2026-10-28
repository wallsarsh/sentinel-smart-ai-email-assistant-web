---
id: T068
title: "Live inbox updates"
phase: P3
status: todo
owner: ""
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
- [ ] Reconnect and dedupe tests
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
