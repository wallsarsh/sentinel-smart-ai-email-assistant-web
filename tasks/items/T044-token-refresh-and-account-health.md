---
id: T044
title: "Token refresh and account health"
phase: P2
status: done
owner: "claude"
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
- [x] Concurrent calls refresh once (test)
- [x] Reauth state surfaced to UI and notifications
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 12:46Z claimed by claude
- 2026-10-28 12:47Z Token source: single-flight refresh, rotated token persistence, needs_reauth on revoked grants
- 2026-10-28 12:47Z status -> done
