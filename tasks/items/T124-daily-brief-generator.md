---
id: T124
title: "Daily brief generator"
phase: P7
status: done
owner: "claude"
type: code
size: L
deps: [T081, T091, T080]
paths: [server/brief/]
refs: [MOBILE-ADD §5.3]
reqs: [FR-SUM-01]
updated: 2026-10-28
---

# T124 — Daily brief generator

## Goal
Brief from stored summaries, counts from the database, unknown ids dropped, items without valid ids dropped, due actions included, catch-up variant not stored.

## Acceptance
- [x] Fake-router tests
- [x] Prompt carries no ids
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 17:25Z claimed by claude
- 2026-10-28 17:34Z Brief generator ported: stored summaries only, throwaway ids, counts from DB, unknown/empty-id/duplicate items dropped, due actions included, bulk FYI excluded, catch-up not stored, one repair turn.
- 2026-10-28 17:34Z status -> done
