---
id: T079
title: "Task routes and usage UI"
phase: P4
status: done
owner: "claude"
type: code
size: M
deps: [T075, T076, T077]
paths: [app/pages/settings/ai/routes.vue, app/pages/settings/usage.vue]
refs: [MOBILE-ADD §10.2]
reqs: [FR-AI-06, FR-AI-07]
updated: 2026-10-28
---

# T079 — Task routes and usage UI

## Goal
Per-task provider/model/fallback editor with parameters; usage charts per day/provider/model, caps, editable prices.

## Acceptance
- [x] Component tests
- [x] Charts accessible (table fallback)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:25Z claimed by claude
- 2026-10-28 14:28Z Task routes editor (chain of up to 4, reorder, per-route maxTokens/temperature, model datalist) and usage page (today vs caps, 30-day chart with table fallback, per-model totals with unpriced hint, price entry, cap editing); usage breakdown API
- 2026-10-28 14:28Z status -> done
