---
id: T070
title: "AI ports and Anthropic adapter"
phase: P4
status: todo
owner: ""
type: code
size: L
deps: [T005, T029]
paths: [server/ai/]
refs: [MOBILE-ADD §5, PROMPTS]
reqs: [FR-AI-01]
updated: 2026-10-28
---

# T070 — AI ports and Anthropic adapter

## Goal
AiProvider port (complete, stream), request/response types, Anthropic Messages adapter with structured output and usage.

## Acceptance
- [ ] Recorded-fixture tests
- [ ] Errors mapped to failures
- [ ] No model literals in code
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
