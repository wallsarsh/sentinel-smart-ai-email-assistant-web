---
id: T025
title: "CSRF, rate limiting and security headers"
phase: P1
status: todo
owner: ""
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
- [ ] Tests for blocked cross-site POST
- [ ] Limits configurable
- [ ] CSP has no unsafe-inline for scripts
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
