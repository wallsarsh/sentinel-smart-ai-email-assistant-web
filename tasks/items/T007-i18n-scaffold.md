---
id: T007
title: "i18n scaffold"
phase: P0
status: todo
owner: ""
type: code
size: S
deps: [T001]
paths: [app/i18n/, nuxt.config.ts]
refs: [WEB §3]
reqs: [NFR-UX-02]
updated: 2026-10-28
---

# T007 — i18n scaffold

## Goal
vue-i18n with English strings extracted; lint rule against hard-coded UI strings.

## Acceptance
- [ ] All shell strings use keys
- [ ] Pseudo-locale for truncation checks
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
