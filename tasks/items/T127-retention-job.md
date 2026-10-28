---
id: T127
title: "Retention job"
phase: P7
status: done
owner: "claude"
type: code
size: S
deps: [T033]
paths: [worker/jobs/retention.ts]
refs: [MOBILE-ADD §6]
reqs: [FR-SET-04]
updated: 2026-10-28
---

# T127 — Retention job

## Goal
Delete old mail (keeping open-task mail), briefs 30 d, usage 90 d, run records 14 d, expired sessions/jobs.

## Acceptance
- [x] Fake-clock tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 17:52Z claimed by claude
- 2026-10-28 17:59Z Retention job: mail per user setting (keeps open-task mail), briefs 30d, usage 90d, run records 14d, ledger 30d, expired sessions/reset tokens, finished jobs 7d; daily per-user + shared jobs queued by the worker; fake-clock tests.
- 2026-10-28 17:59Z status -> done
