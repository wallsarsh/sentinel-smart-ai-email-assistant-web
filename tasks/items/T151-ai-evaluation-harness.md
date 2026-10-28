---
id: T151
title: "AI evaluation harness"
phase: P9
status: done
owner: "claude"
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
- [x] Env-configured, never in CI by default
- [x] Synthetic sample set committed
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 19:43Z claimed by claude
- 2026-10-28 19:52Z AI evaluation harness ported: metrics (hand-checked tests), runner with token budget and spend limit, synthetic 12-email labelled set incl. an injection, report with targets; env-configured, refuses in CI, not in npm test/CI. NOT run against a real model (no key available); scoring/budgets are tested with scripted providers only.
- 2026-10-28 19:52Z status -> done
