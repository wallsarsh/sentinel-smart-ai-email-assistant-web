---
id: T049
title: "IMAP/SMTP autodiscovery"
phase: P2
status: done
owner: "claude"
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
- [x] Known providers resolve offline
- [x] Probing only to public hosts
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 12:54Z claimed by claude
- 2026-10-28 12:55Z IMAP autodiscovery: offline provider table + aliases, Mozilla autoconfig (3 URLs), MX->provider, SRV, domain guess; probe refuses non-public addresses
- 2026-10-28 12:55Z status -> done
