---
id: T152
title: "Accessibility audit"
phase: P9
status: todo
owner: ""
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
- [ ] No serious/critical axe violations
- [ ] Findings logged and fixed
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
