---
id: T110
title: "Send confirmation UI and API"
phase: P6
status: todo
owner: ""
type: code
size: L
deps: [T105, T102, T109]
paths: [app/components/send/, server/api/send/]
refs: [MOBILE-ADD §10.2]
reqs: [FR-SND-01]
updated: 2026-10-28
---

# T110 — Send confirmation UI and API

## Goal
Confirmation dialog showing recipients, subject and full body; must scroll to end; placeholders block unless overridden; new/external recipients and foreign links flagged; issues the authorization from the explicit click only.

## Acceptance
- [ ] Send disabled until conditions met (tests)
- [ ] Authorization endpoint accepts only a direct user action (CSRF + step-up)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
