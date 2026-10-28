---
id: T127
title: "Retention job"
phase: P7
status: todo
owner: ""
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
- [ ] Fake-clock tests
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
