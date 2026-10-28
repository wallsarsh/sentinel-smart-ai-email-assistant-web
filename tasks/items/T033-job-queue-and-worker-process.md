---
id: T033
title: "Job queue and worker process"
phase: P1
status: done
owner: "claude-sonnet-5-5"
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
- [x] Worker runs without HTTP server
- [x] Jobs time-boxed and resumable
- [x] Tests with fake clock
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:50Z claimed by claude-sonnet-5-5
- 2026-10-28 10:51Z Own Postgres queue instead of pg-boss (testable on PGlite, no extra service): idempotent keys, FOR UPDATE SKIP LOCKED claims, leases (crashed worker re-claimed), per-user running limit (2), exponential backoff to failure, purge, time-boxed runner with Deadline, period-keyed schedules safe from many instances, worker entrypoint (npm run worker) with graceful shutdown; migration 0001
- 2026-10-28 10:51Z status -> done
