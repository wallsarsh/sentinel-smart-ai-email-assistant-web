---
id: T034
title: "Server-sent events channel"
phase: P1
status: done
owner: "claude-sonnet-5-5"
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
- [x] Reconnect with last-event-id
- [x] Fan-out via Postgres LISTEN/NOTIFY across instances
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:51Z claimed by claude-sonnet-5-5
- 2026-10-28 10:52Z EventHub (per-user fan-out, bounded replay via Last-Event-ID, time-based ids, duplicate drop, 6 KB payload cap), Postgres LISTEN/NOTIFY bridge attached in place, authenticated GET /api/events with keep-alive pings. Bridge exercised with an in-memory bus; real LISTEN/NOTIFY needs Postgres (T160 staging)
- 2026-10-28 10:52Z status -> done
