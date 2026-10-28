---
id: T082
title: "AI test bench"
phase: P4
status: todo
owner: ""
type: code
size: M
deps: [T079, T080]
paths: [app/pages/settings/ai/bench.vue, server/api/ai/bench.post.ts]
refs: [MOBILE-ADD §10.2]
reqs: [FR-AI-11]
updated: 2026-10-28
---

# T082 — AI test bench

## Goal
Synthetic samples only, compare two models side by side with tokens, latency, cost.

## Acceptance
- [ ] No real mail path (test)
- [ ] Calls count toward usage
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
