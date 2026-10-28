---
id: T151
title: "AI evaluation harness"
phase: P9
status: todo
owner: ""
type: test
size: M
deps: [T091, T101, T124]
paths: [tools/eval/]
refs: [MOBILE-TEST §6]
reqs: [BO-2]
updated: 2026-10-28
---

# T151 — AI evaluation harness

## Goal
Port the mobile harness: labelled set, needsReply P/R, importance macro-F1, action recall, schema-valid rate vs targets, token report, spend limit.

## Acceptance
- [ ] Env-configured, never in CI by default
- [ ] Synthetic sample set committed
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
