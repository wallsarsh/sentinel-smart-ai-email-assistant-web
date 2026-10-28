---
id: T044
title: "Token refresh and account health"
phase: P2
status: todo
owner: ""
type: code
size: M
deps: [T042, T043]
paths: [server/mail/oauth/token-source.ts]
refs: [MOBILE-ADD §3]
reqs: [FR-ACC-05]
updated: 2026-10-28
---

# T044 — Token refresh and account health

## Goal
Refreshing token source with single-flight refresh and `needs_reauth` status on revoked grants.

## Acceptance
- [ ] Concurrent calls refresh once (test)
- [ ] Reauth state surfaced to UI and notifications
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
