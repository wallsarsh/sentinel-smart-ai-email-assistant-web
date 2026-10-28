---
id: T128
title: "Background settings and diagnostics UI"
phase: P7
status: done
owner: "claude"
type: code
size: M
deps: [T123, T126]
paths: [app/pages/settings/background.vue]
refs: [MOBILE-ADD §10.2]
reqs: [FR-BG-07]
updated: 2026-10-28
---

# T128 — Background settings and diagnostics UI

## Goal
Interval, background AI, notifications mode/previews/quiet hours/mute, push permission state, last runs and errors per account.

## Acceptance
- [x] Component tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 17:59Z claimed by claude
- 2026-10-28 18:05Z Background settings page: interval, background AI, notification mode/previews/quiet hours/muted accounts, brief time and opt-in push, push permission state, recent runs with error codes and per-account sync state.
- 2026-10-28 18:05Z status -> done
