---
id: T112
title: "Sending settings and sent log"
phase: P6
status: done
owner: "claude"
type: code
size: S
deps: [T111, T031]
paths: [app/pages/settings/sending.vue]
refs: [MOBILE-ADD §10.2]
reqs: [FR-SND-06]
updated: 2026-10-28
---

# T112 — Sending settings and sent log

## Goal
Undo delay, re-auth to send, placeholder/external warnings, daily limit, sent log (metadata only).

## Acceptance
- [x] Component tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 16:38Z claimed by claude
- 2026-10-28 16:44Z Sending settings page (undo window 0-30, step-up, placeholder block, external warning, daily limit) and sent log (metadata only) with search-only reconcile for uncertain sends; external warning honours the setting
- 2026-10-28 16:44Z status -> done
