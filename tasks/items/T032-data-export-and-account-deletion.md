---
id: T032
title: "Data export and account deletion"
phase: P1
status: todo
owner: ""
type: code
size: M
deps: [T021, T022, T026]
paths: [server/api/account/]
refs: [MOBILE-BRD NFR-PRV-04]
reqs: [NFR-PRV-04]
updated: 2026-10-28
---

# T032 — Data export and account deletion

## Goal
Export all user data as a ZIP (no secrets), delete account with cascade, and revoke provider tokens.

## Acceptance
- [ ] Deletion leaves no rows for the user (test)
- [ ] Provider token revocation attempted and logged
- [ ] Step-up required
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
