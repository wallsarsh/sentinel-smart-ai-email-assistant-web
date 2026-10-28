---
id: T123
title: "Notification rules and quiet hours"
phase: P7
status: todo
owner: ""
type: code
size: M
deps: [T122, T121]
paths: [server/push/rules.ts]
refs: [MOBILE-BRD FR-BG-03]
reqs: [FR-BG-03, FR-BG-04]
updated: 2026-10-28
---

# T123 — Notification rules and quiet hours

## Goal
Modes (important/needs reply/all/none), per-account mute, quiet hours in the user time zone, previews off by default, once per message.

## Acceptance
- [ ] Rule matrix tests ported from mobile
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
