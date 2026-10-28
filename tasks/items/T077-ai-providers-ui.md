---
id: T077
title: "AI providers UI"
phase: P4
status: done
owner: "claude"
type: code
size: L
deps: [T073, T008, T055]
paths: [app/pages/settings/ai/]
refs: [MOBILE-ADD §10.2]
reqs: [FR-AI-01]
updated: 2026-10-28
---

# T077 — AI providers UI

## Goal
Provider list/add (presets: Claude, ChatGPT, compatible), key entry, test connection, model picker, status.

## Acceptance
- [x] Key field write-only
- [x] Component tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:19Z claimed by claude
- 2026-10-28 14:21Z AI providers UI: preset-based add form (base URL only for compatible), write-only key inputs cleared after submit, key hint only, test connection/status, replace key, remove, consent link; component + axe tests
- 2026-10-28 14:21Z status -> done
