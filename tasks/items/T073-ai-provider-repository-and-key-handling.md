---
id: T073
title: "AI provider repository and key handling"
phase: P4
status: todo
owner: ""
type: code
size: M
deps: [T022, T021]
paths: [server/repos/ai-providers.ts, server/api/ai/providers/]
refs: [MOBILE-BRD FR-AI-05]
reqs: [FR-AI-05]
updated: 2026-10-28
---

# T073 — AI provider repository and key handling

## Goal
CRUD for providers; keys encrypted, masked on read, replaceable without removing the provider; model list refresh.

## Acceptance
- [ ] Key never returned in full (test)
- [ ] Key never logged (test)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
