---
id: T103
title: "Save draft use case"
phase: P6
status: done
owner: "claude"
type: code
size: M
deps: [T046, T048, T051, T102]
paths: [server/drafts/save.ts, server/api/drafts/]
refs: [MOBILE-ADD §4]
reqs: [FR-DRF-03]
updated: 2026-10-28
---

# T103 — Save draft use case

## Goal
Store the local row first, then create or update the provider draft; one draft per message; retries never duplicate.

## Acceptance
- [x] Offline/failure keeps the key (test)
- [x] Update not create on second save
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:28Z claimed by claude
- 2026-10-28 15:32Z Save draft: local row + idempotency key first, then create/update provider draft (signature appended once), one draft per message, failure keeps key so retries update instead of duplicating, discard only removes our draft; PUT/DELETE /api/drafts/message/:id (no send path)
- 2026-10-28 15:32Z status -> done
