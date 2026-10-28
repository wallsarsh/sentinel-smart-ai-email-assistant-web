---
id: T053
title: "Accounts API"
phase: P2
status: todo
owner: ""
type: code
size: M
deps: [T042, T043, T050, T052]
paths: [server/api/accounts/]
refs: [WEB §6]
reqs: [FR-ACC-04]
updated: 2026-10-28
---

# T053 — Accounts API

## Goal
List/add/update/remove accounts, IMAP settings with credential test, folder selection, account limit, AI-exclusion flag.

## Acceptance
- [ ] Removal revokes tokens and deletes data
- [ ] Validation errors localized
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
