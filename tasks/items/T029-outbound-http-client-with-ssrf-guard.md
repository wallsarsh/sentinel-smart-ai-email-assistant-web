---
id: T029
title: "Outbound HTTP client with SSRF guard"
phase: P1
status: done
owner: "claude-sonnet-5-5"
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
- [x] Private ranges blocked incl. IPv6 and redirects
- [x] Per-provider allow of LAN hosts disabled on the server
- [x] Unit tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:45Z claimed by claude-sonnet-5-5
- 2026-10-28 10:46Z SSRF guard (public-address classification incl. IPv4-mapped/6to4/Teredo, https only, no credentials, localhost/.internal names, all resolved addresses must be public) + safeFetch (connection pinned to vetted IPs via custom lookup, manual redirects re-validated, timeout, size cap, retries only for GET/HEAD with backoff, scrubbed errors). Per-provider LAN opt-out intentionally absent on the server
- 2026-10-28 10:46Z status -> done
