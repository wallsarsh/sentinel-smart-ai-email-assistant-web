---
id: T070
title: "AI ports and Anthropic adapter"
phase: P4
status: done
owner: "claude"
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
- [x] Recorded-fixture tests
- [x] Errors mapped to failures
- [x] No model literals in code
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:46Z claimed by claude
- 2026-10-28 13:48Z AI port (AiProvider/AiRequest/AiResponse/AiHttp), SSRF-guarded transport incl. safeStream, Anthropic Messages adapter (JSON-schema output, no tools, usage incl. cache reads), status->failure mapping without provider text; recorded fixtures; test forbids model literals
- 2026-10-28 13:48Z status -> done
