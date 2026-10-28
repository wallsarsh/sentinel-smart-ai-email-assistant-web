---
id: T143
title: "PWA shell"
phase: P8
status: todo
owner: ""
type: code
size: M
deps: [T008, T122]
paths: [app/public/, app/sw/]
refs: [WEB §6]
reqs: [NFR-UX-04]
updated: 2026-10-28
---

# T143 — PWA shell

## Goal
Manifest, icons, installability, offline shell with cached last brief/inbox list metadata only and a clear offline banner.

## Acceptance
- [ ] Lighthouse PWA checks pass
- [ ] No mail bodies in the cache (test)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
