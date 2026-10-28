---
id: T041
title: "MIME reply builder"
phase: P2
status: todo
owner: ""
type: code
size: M
deps: [T005]
paths: [server/mail/mime/]
refs: [MOBILE-ADD §4.2]
reqs: [FR-DRF-03]
updated: 2026-10-28
---

# T041 — MIME reply builder

## Goal
Threading headers, reply vs reply-all recipients, subject handling, RFC 2047, deterministic Message-ID.

## Acceptance
- [ ] Fixture tests ported from mobile
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
