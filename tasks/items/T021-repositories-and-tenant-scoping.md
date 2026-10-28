---
id: T021
title: "Repositories and tenant scoping"
phase: P1
status: done
owner: "claude-sonnet-5-5"
type: code
size: M
deps: [T020]
paths: [server/repos/]
refs: [WEB §5]
reqs: [NFR-SEC-03]
updated: 2026-10-28
---

# T021 — Repositories and tenant scoping

## Goal
Repository layer where every query takes a `userId`; no raw table access from routes.

## Acceptance
- [x] Cross-user access impossible by construction (test with two users)
- [x] Transactions helper
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:32Z claimed by claude-sonnet-5-5
- 2026-10-28 10:32Z forUser(db,userId) scoped repositories (accounts, mail: folders/threads/messages) + transaction helper; two-user tests prove read/update/delete/insert isolation; architecture test forbids schema imports outside server/repos and server/db. Later tasks add repos in the same pattern
- 2026-10-28 10:32Z status -> done
