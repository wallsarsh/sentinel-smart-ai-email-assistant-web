---
id: T092
title: "Due-date resolver"
phase: P5
status: done
owner: "claude"
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
- [x] DST and range tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:44Z claimed by claude
- 2026-10-28 14:47Z Due-date resolver ported from mobile with parity tests plus DST-correct local times (offset taken at the target), range rules, half-hour/negative zones
- 2026-10-28 14:47Z status -> done
