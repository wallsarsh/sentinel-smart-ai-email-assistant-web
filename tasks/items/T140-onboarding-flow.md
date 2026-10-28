---
id: T140
title: "Onboarding flow"
phase: P8
status: done
owner: "claude"
type: code
size: M
deps: [T054, T077, T078, T122]
paths: [app/pages/onboarding/]
refs: [MOBILE-ADD §10.1]
reqs: [FR-ONB-01]
updated: 2026-10-28
---

# T140 — Onboarding flow

## Goal
Welcome, privacy/control, connect email, AI + consent, brief time and notifications; skippable and resumable.

## Acceptance
- [x] Route guard sends new users here
- [x] Resume after reload
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 18:05Z claimed by claude
- 2026-10-28 18:14Z Onboarding + sign-in: login (with second factor), signup, password reset pages; global route guard (signed-out to /login with safe next, new users to /onboarding); five-step skippable onboarding resumed from the server-stored step; completion stored in onboarding.complete.
- 2026-10-28 18:14Z status -> done
