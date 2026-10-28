---
id: T126
title: "Brief scheduling"
phase: P7
status: todo
owner: ""
type: code
size: S
deps: [T124, T121, T123]
paths: [worker/jobs/brief.ts]
refs: [MOBILE-BRD FR-SUM-02]
reqs: [FR-SUM-02, FR-SUM-03]
updated: 2026-10-28
---

# T126 — Brief scheduling

## Goal
Per-user brief time in their time zone (default 07:30), generate-on-open fallback, opt-in push when ready.

## Acceptance
- [ ] DST tests
- [ ] No duplicate briefs per day
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
