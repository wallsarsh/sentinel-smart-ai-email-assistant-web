---
id: T144
title: "Visual regression and responsive polish"
phase: P8
status: done
owner: "claude"
type: test
size: S
deps: [T125, T064, T102, T110]
paths: [tests/visual/]
refs: [WEB §11]
reqs: [NFR-UX-01]
updated: 2026-10-28
---

# T144 — Visual regression and responsive polish

## Goal
Playwright screenshots of key pages in light/dark at mobile/tablet/desktop and 200% zoom.

## Acceptance
- [x] Baselines committed
- [x] Brief, inbox, detail, composer, confirmation, settings covered
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 18:49Z claimed by claude
- 2026-10-28 19:06Z Visual regression: Vite gallery harness mounts real components/layout with fixtures; Playwright screenshots of brief, inbox, detail, composer, confirmation, settings x light/dark x mobile/tablet/desktop/200%-zoom (48 baselines committed), plus 320px no-sideways-scroll and tap-target checks. Found and fixed: nav never rendered (layout used <AppNav>, Nuxt name is ShellAppNav; new test checks all component names), settings overflow at 320px, undersized tap targets. Scenes use fixture data, not live pages.
- 2026-10-28 19:06Z status -> done
