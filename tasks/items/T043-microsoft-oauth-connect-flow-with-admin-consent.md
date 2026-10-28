---
id: T043
title: "Microsoft OAuth connect flow with admin consent"
phase: P2
status: done
owner: "claude"
type: code
size: L
deps: [T022, T023]
paths: [server/mail/oauth/microsoft.ts, server/api/accounts/microsoft/]
refs: [WEB §7, MOBILE-ADD §3]
reqs: [FR-ACC-02]
updated: 2026-10-28
---

# T043 — Microsoft OAuth connect flow with admin consent

> Live use needs the T010 registration (manual); code and tests do not, so T010 is verified in T160.

## Goal
MSAL-style code flow + PKCE, tenant handling, MFA/Conditional Access compatible, admin-consent-required detection and help page.

## Acceptance
- [x] Handles consent_required and AADSTS errors with guidance
- [x] Tokens only in the secret store
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 12:43Z claimed by claude
- 2026-10-28 12:44Z Microsoft OAuth: PKCE, signed user-bound state, AADSTS guidance (admin consent, Conditional Access), rotated refresh tokens, shared account saver; tests
- 2026-10-28 12:44Z status -> done
