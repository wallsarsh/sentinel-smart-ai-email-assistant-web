---
id: T004
title: "Typed configuration"
phase: P0
status: todo
owner: ""
type: code
size: S
deps: [T001]
paths: [server/config/]
refs: [WEB §9]
reqs: [NFR-SEC-01]
updated: 2026-10-28
---

# T004 — Typed configuration

## Goal
Zod-validated runtime config from env (DB URL, KEK, session secret, OAuth client ids/secrets, VAPID keys, base URL); fail fast with a clear message.

## Acceptance
- [ ] Missing or weak secrets stop startup
- [ ] Config object is the only reader of `process.env`
- [ ] Unit tests for each validation rule
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
