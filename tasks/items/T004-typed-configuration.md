---
id: T004
title: "Typed configuration"
phase: P0
status: done
owner: "claude-sonnet-5-5"
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
- [x] Missing or weak secrets stop startup
- [x] Config object is the only reader of `process.env`
- [x] Unit tests for each validation rule
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:24Z claimed by claude-sonnet-5-5
- 2026-10-28 10:25Z zod config (loadConfig/useConfig), prod rules (https, no placeholders), KEK 32 bytes; test asserts only server/config reads process.env
- 2026-10-28 10:25Z status -> done
