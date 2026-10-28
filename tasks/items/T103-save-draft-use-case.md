---
id: T103
title: "Save draft use case"
phase: P6
status: todo
owner: ""
type: code
size: M
deps: [T046, T048, T051, T102]
paths: [server/drafts/save.ts, server/api/drafts/]
refs: [MOBILE-ADD §4]
reqs: [FR-DRF-03]
updated: 2026-10-28
---

# T103 — Save draft use case

## Goal
Store the local row first, then create or update the provider draft; one draft per message; retries never duplicate.

## Acceptance
- [ ] Offline/failure keeps the key (test)
- [ ] Update not create on second save
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
