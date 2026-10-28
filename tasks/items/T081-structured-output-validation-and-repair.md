---
id: T081
title: "Structured output validation and repair"
phase: P4
status: done
owner: "claude"
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
- [x] Malformed/truncated corpus tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:14Z claimed by claude
- 2026-10-28 14:18Z Structured output: JSON extraction (fences, chatter, strings), ajv validation with value-free error paths, one repair turn, one longer retry on truncation, typed ai_output failures, id reconciliation; malformed/truncated corpus tests
- 2026-10-28 14:18Z status -> done
