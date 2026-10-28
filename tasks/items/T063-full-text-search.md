---
id: T063
title: "Full-text search"
phase: P3
status: done
owner: "claude"
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
- [x] Index kept in sync on insert/delete (test)
- [x] Special characters safe
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:21Z claimed by claude
- 2026-10-28 13:24Z Full-text search: GIN expression index (migration 0002) on subject/from/body, safe prefix tsquery builder, ts_headline with escaped <mark>, per-user + processed-folder scoping, API. Tests run on PGlite (real Postgres), so no LIKE fallback needed
- 2026-10-28 13:24Z status -> done
