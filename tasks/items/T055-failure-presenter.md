---
id: T055
title: "Failure presenter"
phase: P2
status: done
owner: "claude"
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
- [x] Table-driven tests cover every kind
- [x] No content or secrets in messages
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:05Z claimed by claude
- 2026-10-28 13:07Z Failure presenter: kind/problem/status -> failure.* key + recovery action, params limited to seconds/field; FailureBanner; pseudo-locale generator (npm run i18n:pseudo) with sync test
- 2026-10-28 13:07Z status -> done
