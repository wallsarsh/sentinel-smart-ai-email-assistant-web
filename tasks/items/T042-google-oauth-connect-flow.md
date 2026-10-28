---
id: T042
title: "Google OAuth connect flow"
phase: P2
status: done
owner: ""
type: code
size: L
deps: [T022, T023]
paths: [server/mail/oauth/google.ts, server/api/accounts/google/]
refs: [WEB §7, MOBILE-ADD §3]
reqs: [FR-ACC-01]
updated: 2026-10-28
---

# T042 — Google OAuth connect flow

> Live use needs the T009 registration (manual); code and tests do not, so T009 is verified in T160.

## Goal
Authorization code + PKCE with signed state bound to the session, callback, scope handling, refresh token storage, revoke on disconnect.

## Acceptance
- [x] State/PKCE verified (negative tests)
- [x] Tokens only in the secret store
- [x] Re-consent when scopes change
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 12:41Z Google OAuth: PKCE + signed user-bound state cookie, scope check, refresh/revoke, tokens only in secret store, connect/callback routes; negative tests. Needs T009 registration for live use
- 2026-10-28 12:42Z Google OAuth: PKCE + signed user-bound state cookie, scope check, refresh/revoke, tokens only in secret store, connect/callback routes; negative tests. Live use needs T009 registration (manual)
- 2026-10-28 12:43Z Google OAuth: PKCE + signed user-bound state cookie, scope check, refresh/revoke, tokens only in secret store, connect/callback routes; negative tests
- 2026-10-28 12:43Z status -> done
