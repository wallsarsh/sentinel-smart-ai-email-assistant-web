---
id: T074
title: "AI gateway: consent, caps and usage"
phase: P4
status: done
owner: "claude"
type: code
size: M
deps: [T073, T070]
paths: [server/ai/gateway.ts]
refs: [MOBILE-ADD §5]
reqs: [FR-AI-07]
updated: 2026-10-28
---

# T074 — AI gateway: consent, caps and usage

## Goal
Single entry for AI calls: per-provider consent check, daily token/cost caps, usage recording with price table.

## Acceptance
- [x] No call without consent (test)
- [x] Cap pauses processing with a clear failure
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:01Z claimed by claude
- 2026-10-28 14:05Z AI gateway: consent read fresh each call (revoke stops next call), daily token/cost caps (UTC day) with cap_reached failures, usage metering with user prices, streaming through same gates
- 2026-10-28 14:05Z status -> done
