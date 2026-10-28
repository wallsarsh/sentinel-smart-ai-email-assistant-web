---
id: T121
title: "Mail-check job"
phase: P7
status: done
owner: "claude"
type: code
size: M
deps: [T120, T061, T091]
paths: [worker/jobs/mail-check.ts]
refs: [MOBILE-ADD §8.2]
reqs: [FR-BG-02]
updated: 2026-10-28
---

# T121 — Mail-check job

## Goal
Per-user sync, rules, notify, AI triage as budget allows; respects background-AI setting and caps; writes a run record.

## Acceptance
- [x] Deadline tests
- [x] Idempotent on repeat
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 17:02Z claimed by claude
- 2026-10-28 17:07Z Mail-check job (mail.check): sync -> reauth notice -> rules -> notify -> chunked AI triage while the deadline allows (6 s per request), background-AI setting and caps respected (partial, rest queued), run records in bg_runs, retry with backoff only when every account failed retryably, deadline -> timeout record; scheduling and refresh-now now enqueue it; repeat run is idempotent (real services test)
- 2026-10-28 17:07Z status -> done
