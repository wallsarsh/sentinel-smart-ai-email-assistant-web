---
id: T080
title: "Prompt registry and builder"
phase: P4
status: todo
owner: ""
type: code
size: M
deps: [T030, T005]
paths: [server/ai/prompts/]
refs: [PROMPTS, MOBILE-ADD §5]
reqs: [NFR-SEC-07]
updated: 2026-10-28
---

# T080 — Prompt registry and builder

## Goal
Port of the mobile prompt texts, schemas and PromptBuilder (boundary tags, defanging, invisible-char stripping, redaction, caps, subject-only mode).

## Acceptance
- [ ] Injection fixtures pass
- [ ] Prompt versions exported for logging
- [ ] Parity tests with mobile fixtures
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
