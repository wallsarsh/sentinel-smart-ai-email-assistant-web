---
id: T029
title: "Outbound HTTP client with SSRF guard"
phase: P1
status: todo
owner: ""
type: code
size: M
deps: [T004, T006]
paths: [server/http/]
refs: [WEB §8]
reqs: [NFR-SEC-02]
updated: 2026-10-28
---

# T029 — Outbound HTTP client with SSRF guard

## Goal
fetch wrapper: retry with backoff on idempotent calls only, timeouts, redacted logging, and an SSRF guard (blocks private/loopback/link-local, DNS rebinding check) for user-supplied URLs (AI base URL, IMAP hosts).

## Acceptance
- [ ] Private ranges blocked incl. IPv6 and redirects
- [ ] Per-provider allow of LAN hosts disabled on the server
- [ ] Unit tests
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
