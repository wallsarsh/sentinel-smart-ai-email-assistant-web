---
id: T063
title: "Full-text search"
phase: P3
status: todo
owner: ""
type: code
size: M
deps: [T060]
paths: [server/db/search.ts, server/api/search/]
refs: [MOBILE-ADD §6]
reqs: [FR-SRCH-01]
updated: 2026-10-28
---

# T063 — Full-text search

## Goal
Postgres tsvector index with highlight and prefix search, per-user scoping, SQLite LIKE fallback for tests.

## Acceptance
- [ ] Index kept in sync on insert/delete (test)
- [ ] Special characters safe
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
