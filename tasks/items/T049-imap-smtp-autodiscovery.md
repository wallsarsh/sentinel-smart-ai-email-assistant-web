---
id: T049
title: "IMAP/SMTP autodiscovery"
phase: P2
status: todo
owner: ""
type: code
size: M
deps: [T029]
paths: [server/mail/imap/autodiscovery.ts]
refs: [MOBILE-ADD §4.5]
reqs: [FR-ACC-03]
updated: 2026-10-28
---

# T049 — IMAP/SMTP autodiscovery

## Goal
Provider table, Mozilla autoconfig, MX and SRV lookups, port/TLS probing through the SSRF guard.

## Acceptance
- [ ] Known providers resolve offline
- [ ] Probing only to public hosts
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
