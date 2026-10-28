---
id: T152
title: "Accessibility audit"
phase: P9
status: done
owner: "claude"
type: test
size: M
deps: [T140]
paths: [tests/a11y/]
refs: [MOBILE-TEST §7]
reqs: [NFR-UX-05]
updated: 2026-10-28
---

# T152 — Accessibility audit

## Goal
axe checks in Playwright on all pages, keyboard-only walkthrough, screen reader notes, 200% zoom and reduced-motion checks; fix findings.

## Acceptance
- [x] No serious/critical axe violations
- [x] Findings logged and fixed
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 19:52Z claimed by claude
- 2026-10-28 20:12Z A11y audit: axe on all 27 real pages in light+dark in Chromium, keyboard/focus, reduced-motion, 320px reflow checks (tests/a11y, in the CI e2e job); findings logged in docs/accessibility.md and fixed (dark-mode form control contrast, missing h1); visual baselines refreshed for the dark-mode controls. No screen reader or device run: noted for T160.
- 2026-10-28 20:12Z status -> done
