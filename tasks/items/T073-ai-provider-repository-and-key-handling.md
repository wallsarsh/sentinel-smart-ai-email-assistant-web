---
id: T073
title: "AI provider repository and key handling"
phase: P4
status: done
owner: "claude"
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
- [x] Key never returned in full (test)
- [x] Key never logged (test)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:54Z claimed by claude
- 2026-10-28 13:57Z AI provider repo + service + API: presets, encrypted keys in secret store (write-only PUT, masked hint only), key replace keeps id/consent/routes, model refresh + status, base URL policy, per-user limit; tests prove key never returned/stored plain/logged
- 2026-10-28 13:57Z status -> done
