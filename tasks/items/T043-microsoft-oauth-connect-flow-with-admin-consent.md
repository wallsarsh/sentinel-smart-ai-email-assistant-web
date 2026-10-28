---
id: T043
title: "Microsoft OAuth connect flow with admin consent"
phase: P2
status: todo
owner: ""
type: code
size: L
deps: [T022, T023, T010]
paths: [server/mail/oauth/microsoft.ts, server/api/accounts/microsoft/]
refs: [WEB §7, MOBILE-ADD §3]
reqs: [FR-ACC-02]
updated: 2026-10-28
---

# T043 — Microsoft OAuth connect flow with admin consent

## Goal
MSAL-style code flow + PKCE, tenant handling, MFA/Conditional Access compatible, admin-consent-required detection and help page.

## Acceptance
- [ ] Handles consent_required and AADSTS errors with guidance
- [ ] Tokens only in the secret store
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
