---
id: T051
title: "IMAP drafts"
phase: P2
status: done
owner: "claude"
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
- [x] Idempotent by Message-ID
- [x] Only Sentinel-created drafts deleted
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 12:59Z claimed by claude
- 2026-10-28 12:59Z IMAP drafts: APPEND \Draft, replace by append+remove with stable Message-ID, ownership by sentinel- prefix, retry returns existing draft (implemented with T050)
- 2026-10-28 12:59Z status -> done
