---
id: T020
title: "Database schema and migrations"
phase: P1
status: done
owner: "claude-sonnet-5-5"
type: code
size: L
deps: [T005]
paths: [server/db/schema/, server/db/migrations/]
refs: [WEB §5, MOBILE-ADD §6]
reqs: [NFR-MNT-01]
updated: 2026-10-28
---

# T020 — Database schema and migrations

## Goal
Drizzle schema + migrations for users, sessions, accounts, folders, threads, messages, triage, actions, drafts, send records, briefs, AI providers/routes/usage, sender rules, settings, jobs, push subscriptions, audit log.

## Acceptance
- [x] Migrations apply on empty Postgres and on SQLite for tests
- [x] Every table scoped by user_id with FK and index
- [x] Schema test suite
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:29Z claimed by claude-sonnet-5-5
- 2026-10-28 10:31Z Drizzle Postgres schema (auth, mail, triage, drafts/sends/briefs, AI, settings, push, secrets, audit, bg runs) + generated migration; PGlite (in-process Postgres) replaces SQLite for tests so one dialect is tested; tests: migrations apply, every table has cascading user_id, user deletion cascades, uniqueness. FTS vector column deferred to T063
- 2026-10-28 10:31Z status -> done
