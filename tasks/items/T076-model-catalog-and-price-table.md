---
id: T076
title: "Model catalog and price table"
phase: P4
status: todo
owner: ""
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
- [ ] Unknown price yields cost 0 and a visible hint
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
