---
id: T055
title: "Failure presenter"
phase: P2
status: todo
owner: ""
type: code
size: S
deps: [T005, T007]
paths: [app/utils/failure-presenter.ts, app/components/FailureBanner.vue]
refs: [MOBILE-ADD §10]
reqs: [NFR-UX-03]
updated: 2026-10-28
---

# T055 — Failure presenter

## Goal
Maps every failure kind and provider code to a localized message and a recovery action.

## Acceptance
- [ ] Table-driven tests cover every kind
- [ ] No content or secrets in messages
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
