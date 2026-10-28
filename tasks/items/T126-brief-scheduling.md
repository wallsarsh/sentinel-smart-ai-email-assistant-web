---
id: T126
title: "Brief scheduling"
phase: P7
status: done
owner: "claude"
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
- [x] DST tests
- [x] No duplicate briefs per day
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 17:41Z claimed by claude
- 2026-10-28 17:48Z Brief scheduling: brief time in the user's zone (DST-correct, default 07:30), due check, per-day claim so two workers never write two briefs, retry after failure, generate-on-open fallback, opt-in brief push, wired into the mail check.
- 2026-10-28 17:48Z status -> done
