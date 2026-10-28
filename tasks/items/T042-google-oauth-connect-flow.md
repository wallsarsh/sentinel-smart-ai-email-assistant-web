---
id: T042
title: "Google OAuth connect flow"
phase: P2
status: todo
owner: ""
type: code
size: L
deps: [T022, T023, T009]
paths: [server/mail/oauth/google.ts, server/api/accounts/google/]
refs: [WEB §7, MOBILE-ADD §3]
reqs: [FR-ACC-01]
updated: 2026-10-28
---

# T042 — Google OAuth connect flow

## Goal
Authorization code + PKCE with signed state bound to the session, callback, scope handling, refresh token storage, revoke on disconnect.

## Acceptance
- [ ] State/PKCE verified (negative tests)
- [ ] Tokens only in the secret store
- [ ] Re-consent when scopes change
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
