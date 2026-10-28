---
id: T081
title: "Structured output validation and repair"
phase: P4
status: todo
owner: ""
type: code
size: M
deps: [T080, T070]
paths: [server/ai/structured.ts]
refs: [PROMPTS]
reqs: [FR-AI-09]
updated: 2026-10-28
---

# T081 — Structured output validation and repair

## Goal
JSON-schema validation, one repair turn, truncation handling, unknown-id dropping.

## Acceptance
- [ ] Malformed/truncated corpus tests
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
