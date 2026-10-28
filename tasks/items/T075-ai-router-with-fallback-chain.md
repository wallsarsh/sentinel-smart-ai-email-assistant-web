---
id: T075
title: "AI router with fallback chain"
phase: P4
status: done
owner: "claude"
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
- [x] Fallback rules table-tested
- [x] Changes apply on next call
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:06Z claimed by claude
- 2026-10-28 14:08Z AI router: per-task chains (default fallback) read every call, ordered fallback on retryable failures (table-tested), per-route maxTokens/temperature, chain validation and API
- 2026-10-28 14:08Z status -> done
