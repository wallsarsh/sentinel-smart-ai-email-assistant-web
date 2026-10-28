---
id: T022
title: "Envelope encryption secret store"
phase: P1
status: todo
owner: ""
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
- [ ] Ciphertext never contains plaintext (test)
- [ ] Tamper detection
- [ ] KEK rotation re-wraps all DEKs
- [ ] Secrets never returned to clients
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
