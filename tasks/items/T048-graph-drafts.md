---
id: T048
title: "Graph drafts"
phase: P2
status: done
owner: "claude"
type: code
size: M
deps: [T047, T041]
paths: [server/mail/graph/drafts.ts]
refs: [MOBILE-ADD §4.4]
reqs: [FR-DRF-03]
updated: 2026-10-28
---

# T048 — Graph drafts

## Goal
createReply drafts with body merge, update and delete, idempotency by internet message id.

## Acceptance
- [x] No duplicate drafts on retry
- [x] Only Sentinel-created drafts touched
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 12:53Z claimed by claude
- 2026-10-28 12:54Z Graph drafts: createReply/createReplyAll, body merge with replaceable marker div, idempotency via sentinel-<key> category (Graph cannot set internetMessageId on createReply), ownership check
- 2026-10-28 12:54Z status -> done
