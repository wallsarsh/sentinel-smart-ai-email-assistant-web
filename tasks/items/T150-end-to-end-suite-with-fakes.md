---
id: T150
title: "End-to-end suite with fakes"
phase: P9
status: todo
owner: ""
type: test
size: L
deps: [T140, T113, T126]
paths: [tests/e2e/]
refs: [MOBILE-TEST §4]
reqs: [NFR-MNT-04]
updated: 2026-10-28
---

# T150 — End-to-end suite with fakes

## Goal
Playwright flows against fake Gmail/Graph/IMAP/AI servers: onboarding, connect, sync, triage, brief, draft, confirm, undo, send, wipe.

## Acceptance
- [ ] Runs in CI
- [ ] Flows documented
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
