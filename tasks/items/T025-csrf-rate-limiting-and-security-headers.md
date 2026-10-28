---
id: T025
title: "CSRF, rate limiting and security headers"
phase: P1
status: done
owner: "claude-sonnet-5-5"
type: code
size: M
deps: [T023]
paths: [server/middleware/]
refs: [WEB §8]
reqs: [NFR-SEC-06]
updated: 2026-10-28
---

# T025 — CSRF, rate limiting and security headers

## Goal
Double-submit CSRF for mutating routes, per-IP/per-user rate limits, strict CSP, HSTS, frame-ancestors none.

## Acceptance
- [x] Tests for blocked cross-site POST
- [x] Limits configurable
- [x] CSP has no unsafe-inline for scripts
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:37Z claimed by claude-sonnet-5-5
- 2026-10-28 10:39Z nuxt-security: nonce CSP (script-src nonce+strict-dynamic, frame-ancestors none), HSTS, XFO, referrer, permissions policy (verified on the built server); own signed double-submit CSRF + Origin check (cross-site POST gets 403 verified), per-user/IP rate limiter with stricter auth class and Retry-After, client plugin adds the CSRF header
- 2026-10-28 10:39Z status -> done
