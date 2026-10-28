---
id: T008
title: "App shell, layout and navigation"
phase: P0
status: todo
owner: ""
type: code
size: M
deps: [T001, T007]
paths: [app/layouts/, app/components/shell/, app/pages/]
refs: [WEB §6]
reqs: [NFR-UX-01]
updated: 2026-10-28
---

# T008 — App shell, layout and navigation

## Goal
Responsive shell: bottom/side navigation (Brief, Inbox, Actions, Settings), route guards placeholders, light/dark theme tokens, skip link.

## Acceptance
- [ ] Works at 360px to 1440px
- [ ] Keyboard navigable
- [ ] Component tests for navigation
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
