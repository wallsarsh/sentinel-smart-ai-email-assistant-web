---
id: T007
title: "i18n scaffold"
phase: P0
status: done
owner: "claude-sonnet-5-5"
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
- [x] All shell strings use keys
- [x] Pseudo-locale for truncation checks
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:27Z claimed by claude-sonnet-5-5
- 2026-10-28 10:28Z @nuxtjs/i18n (locales in i18n/locales) with en and pseudo-locale en-XA; eslint no-raw-text rule fails hard-coded UI text (verified); key-parity test
- 2026-10-28 10:28Z status -> done
