---
id: T074
title: "AI gateway: consent, caps and usage"
phase: P4
status: todo
owner: ""
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
- [ ] No call without consent (test)
- [ ] Cap pauses processing with a clear failure
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
