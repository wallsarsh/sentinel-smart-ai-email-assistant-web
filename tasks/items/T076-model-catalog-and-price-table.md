---
id: T076
title: "Model catalog and price table"
phase: P4
status: done
owner: "claude"
type: code
size: S
deps: [T073]
paths: [server/ai/catalog.ts]
refs: [MOBILE-ADD §5]
reqs: [FR-AI-07]
updated: 2026-10-28
---

# T076 — Model catalog and price table

## Goal
Model list caching, user-editable prices per model (no shipped price list).

## Acceptance
- [x] Unknown price yields cost 0 and a visible hint
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:58Z claimed by claude
- 2026-10-28 14:00Z Model catalog + user-entered price table (USD/1M tokens in settings ai.prices); computeCost with unpriced hint; prices API
- 2026-10-28 14:00Z status -> done
