---
id: T034
title: "Server-sent events channel"
phase: P1
status: todo
owner: ""
type: code
size: S
deps: [T023]
paths: [server/sse/]
refs: [WEB §6]
reqs: [NFR-PERF-01]
updated: 2026-10-28
---

# T034 — Server-sent events channel

## Goal
Authenticated per-user SSE hub for inbox updates, job status and draft streaming.

## Acceptance
- [ ] Reconnect with last-event-id
- [ ] Fan-out via Postgres LISTEN/NOTIFY across instances
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
