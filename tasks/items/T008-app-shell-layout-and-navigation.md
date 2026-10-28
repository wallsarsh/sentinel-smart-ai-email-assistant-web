---
id: T008
title: "App shell, layout and navigation"
phase: P0
status: done
owner: "claude-sonnet-5-5"
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
- [x] Works at 360px to 1440px
- [x] Keyboard navigable
- [x] Component tests for navigation
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:28Z claimed by claude-sonnet-5-5
- 2026-10-28 10:29Z Responsive shell: default layout with skip link, AppNav (bottom bar on mobile, side rail md+, aria-current, 48px targets), four pages, light/dark tokens, reduced-motion, auth middleware placeholder; component tests
- 2026-10-28 10:29Z status -> done
