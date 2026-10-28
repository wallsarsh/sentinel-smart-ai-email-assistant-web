---
id: T032
title: "Data export and account deletion"
phase: P1
status: done
owner: "claude-sonnet-5-5"
type: code
size: M
deps: [T021, T022, T026]
paths: [server/api/account/]
refs: [MOBILE-BRD NFR-PRV-04]
reqs: [NFR-PRV-04]
updated: 2026-10-28
---

# T032 — Data export and account deletion

## Goal
Export all user data as a ZIP (no secrets), delete account with cascade, and revoke provider tokens.

## Acceptance
- [x] Deletion leaves no rows for the user (test)
- [x] Provider token revocation attempted and logged
- [x] Step-up required
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:47Z claimed by claude-sonnet-5-5
- 2026-10-28 10:49Z Export ZIP (one JSON per tenant table; secrets, sessions, MFA, password hashes excluded; other users never included) and account deletion (password required, step-up on route, provider revokers best-effort and reported, cascade verified). Revokers register in container.tokenRevokers when T042/T043 land
- 2026-10-28 10:49Z status -> done
