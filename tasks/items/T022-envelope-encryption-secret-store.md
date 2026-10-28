---
id: T022
title: "Envelope encryption secret store"
phase: P1
status: done
owner: "claude-sonnet-5-5"
type: code
size: M
deps: [T004, T020]
paths: [server/security/secret-store.ts]
refs: [WEB §8]
reqs: [NFR-SEC-04]
updated: 2026-10-28
---

# T022 — Envelope encryption secret store

## Goal
AES-256-GCM per-user data keys wrapped by the KEK; store/read/delete secrets (OAuth tokens, IMAP/SMTP passwords, AI keys); key rotation command.

## Acceptance
- [x] Ciphertext never contains plaintext (test)
- [x] Tamper detection
- [x] KEK rotation re-wraps all DEKs
- [x] Secrets never returned to clients
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:33Z claimed by claude-sonnet-5-5
- 2026-10-28 10:33Z AES-256-GCM envelope store: per-user DEK wrapped by KEK, secrets bound to (user,name) via AAD, tamper/move detection, per-user isolation, rotateKek (versioned ring, idempotent). Rotation CLI wrapper deferred to T158 runbook; never exposed by an API
- 2026-10-28 10:33Z status -> done
