---
id: T142
title: "Security settings"
phase: P8
status: done
owner: "claude"
type: code
size: M
deps: [T024, T026]
paths: [app/pages/settings/security.vue]
refs: [WEB §8]
reqs: [NFR-SEC-05]
updated: 2026-10-28
---

# T142 — Security settings

## Goal
Password change, TOTP management, active sessions with revoke, audit log view, re-auth prompts.

## Acceptance
- [x] Revoked session loses access immediately (test)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 18:26Z claimed by claude
- 2026-10-28 18:35Z Security settings: change password (ends other sessions), two-step setup/renew/disable with recovery codes, active sessions list and revoke (takes effect immediately, own sessions only), 'sign out elsewhere', audit log view, step-up prompts. Fixed: starting a new two-step enrolment is now refused while it is on (it could have switched the factor off without a code); reset email link now points at /reset/confirm.
- 2026-10-28 18:35Z status -> done
