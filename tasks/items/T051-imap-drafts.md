---
id: T051
title: "IMAP drafts"
phase: P2
status: todo
owner: ""
type: code
size: M
deps: [T050, T041]
paths: [server/mail/imap/drafts.ts]
refs: [MOBILE-ADD §4.5]
reqs: [FR-DRF-03]
updated: 2026-10-28
---

# T051 — IMAP drafts

## Goal
APPEND to Drafts with \Draft, replace by delete+append with stable Message-ID, cleanup.

## Acceptance
- [ ] Idempotent by Message-ID
- [ ] Only Sentinel-created drafts deleted
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
