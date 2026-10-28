---
id: T142
title: "Security settings"
phase: P8
status: todo
owner: ""
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
- [ ] Revoked session loses access immediately (test)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
