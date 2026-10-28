---
id: T064
title: "Inbox UI"
phase: P3
status: todo
owner: ""
type: code
size: L
deps: [T062, T008, T055]
paths: [app/pages/inbox/, app/components/inbox/]
refs: [WEB §6, MOBILE-ADD §10.2]
reqs: [FR-READ-05]
updated: 2026-10-28
---

# T064 — Inbox UI

## Goal
List with segment chips and counts, account filter, unread styling, infinite scroll, empty/offline/error states, keyboard shortcuts.

## Acceptance
- [ ] Virtualized list for 5k rows
- [ ] Component tests and axe check
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
