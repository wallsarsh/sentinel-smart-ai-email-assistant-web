---
id: T031
title: "User settings store"
phase: P1
status: todo
owner: ""
type: code
size: S
deps: [T021]
paths: [server/repos/settings.ts, server/api/settings/]
refs: [WEB §5]
reqs: [FR-SET-01]
updated: 2026-10-28
---

# T031 — User settings store

## Goal
Typed per-user settings (zod) with defaults for every setting used by later tasks.

## Acceptance
- [ ] Unknown keys rejected
- [ ] Defaults documented in one table
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
