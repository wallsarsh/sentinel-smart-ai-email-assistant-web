---
id: T071
title: "OpenAI and compatible adapters"
phase: P4
status: done
owner: "claude"
type: code
size: L
deps: [T070]
paths: [server/ai/openai/]
refs: [MOBILE-ADD §5]
reqs: [FR-AI-02]
updated: 2026-10-28
---

# T071 — OpenAI and compatible adapters

## Goal
OpenAI Responses/Chat adapter and OpenAI-compatible mode (base URL, auth header, structured-mode fallback) with SSRF guard on the URL.

## Acceptance
- [x] Fixture tests for strict schema and prompt-only modes
- [x] Base URL policy enforced (https, public host)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:49Z claimed by claude
- 2026-10-28 13:51Z OpenAI chat adapter + compatible mode: strict json_schema with json_object/prompt-only step-down (remembered), api-key or Bearer auth, max_tokens vs max_completion_tokens, cached-token usage, refusal/length mapping, base URL policy (https, public, no credentials) via SSRF guard; fixtures
- 2026-10-28 13:51Z status -> done
