---
id: T033
title: "Job queue and worker process"
phase: P1
status: todo
owner: ""
type: code
size: L
deps: [T020, T004]
paths: [server/jobs/, worker/]
refs: [WEB §7, MOBILE-ADD §8]
reqs: [FR-BG-06]
updated: 2026-10-28
---

# T033 — Job queue and worker process

## Goal
Postgres-backed queue (pg-boss) with a separate worker entrypoint, per-user concurrency limits, idempotent job keys, retries, cron schedules.

## Acceptance
- [ ] Worker runs without HTTP server
- [ ] Jobs time-boxed and resumable
- [ ] Tests with fake clock
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
