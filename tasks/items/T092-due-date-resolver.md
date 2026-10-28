---
id: T092
title: "Due-date resolver"
phase: P5
status: todo
owner: ""
type: code
size: S
deps: [T005]
paths: [server/triage/due-dates.ts]
refs: [MOBILE-ADD §5.3]
reqs: [FR-TRI-03]
updated: 2026-10-28
---

# T092 — Due-date resolver

## Goal
Normalize relative dates in the user time zone; invalid dates to text.

## Acceptance
- [ ] DST and range tests
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
