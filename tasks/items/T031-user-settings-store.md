---
id: T031
title: "User settings store"
phase: P1
status: done
owner: "claude-sonnet-5-5"
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
- [x] Unknown keys rejected
- [x] Defaults documented in one table
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:46Z claimed by claude-sonnet-5-5
- 2026-10-28 10:47Z Typed settings registry (shared/settings.ts, 28 keys with defaults and bounds, privacy-first defaults), per-user repository (corrupt rows fall back to defaults), GET/PUT /api/settings with atomic validation
- 2026-10-28 10:47Z status -> done
