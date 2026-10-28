---
id: T121
title: "Mail-check job"
phase: P7
status: todo
owner: ""
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
- [ ] Deadline tests
- [ ] Idempotent on repeat
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
