---
id: T071
title: "OpenAI and compatible adapters"
phase: P4
status: todo
owner: ""
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
- [ ] Fixture tests for strict schema and prompt-only modes
- [ ] Base URL policy enforced (https, public host)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
