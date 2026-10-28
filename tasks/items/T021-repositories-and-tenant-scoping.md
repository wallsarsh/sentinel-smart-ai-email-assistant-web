---
id: T021
title: "Repositories and tenant scoping"
phase: P1
status: todo
owner: ""
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
- [ ] Cross-user access impossible by construction (test with two users)
- [ ] Transactions helper
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
