---
id: T064
title: "Inbox UI"
phase: P3
status: done
owner: "claude"
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
- [x] Virtualized list for 5k rows
- [x] Component tests and axe check
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:31Z claimed by claude
- 2026-10-28 13:33Z Inbox UI: segment chips with counts, account filter, virtualized list (windowed render for 5k rows), infinite scroll, loading/empty/offline/error states, j/k/Enter/ shortcuts, live reload; component + axe tests
- 2026-10-28 13:33Z status -> done
