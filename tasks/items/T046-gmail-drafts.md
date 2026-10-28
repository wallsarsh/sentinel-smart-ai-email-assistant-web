---
id: T046
title: "Gmail drafts"
phase: P2
status: todo
owner: ""
type: code
size: M
deps: [T045, T041]
paths: [server/mail/gmail/drafts.ts]
refs: [MOBILE-ADD §4.3]
reqs: [FR-DRF-03]
updated: 2026-10-28
---

# T046 — Gmail drafts

## Goal
Create/update/delete reply drafts via raw MIME with threadId and deterministic Message-ID lookup for idempotency.

## Acceptance
- [ ] Retry creates no duplicates (test)
- [ ] Only Sentinel-created drafts are updated or deleted
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
