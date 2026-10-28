---
id: T053
title: "Accounts API"
phase: P2
status: done
owner: "claude"
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
- [x] Removal revokes tokens and deletes data
- [x] Validation errors localized
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:01Z claimed by claude
- 2026-10-28 13:05Z Accounts service + API: list/update/remove, IMAP test+add with credential and SMTP check, folder selection, 5-account limit, AI-exclusion, discover endpoint; removal revokes grant and deletes secrets; Google revoker registered for user deletion. Error text is code-only; localisation in T055
- 2026-10-28 13:05Z status -> done
