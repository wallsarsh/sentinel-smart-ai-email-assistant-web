---
id: T075
title: "AI router with fallback chain"
phase: P4
status: todo
owner: ""
type: code
size: M
deps: [T074]
paths: [server/ai/router.ts]
refs: [MOBILE-ADD §5]
reqs: [FR-AI-06, FR-AI-08]
updated: 2026-10-28
---

# T075 — AI router with fallback chain

## Goal
Per-task provider/model routes resolved on every call, ordered fallbacks on retryable failures, default route.

## Acceptance
- [ ] Fallback rules table-tested
- [ ] Changes apply on next call
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
