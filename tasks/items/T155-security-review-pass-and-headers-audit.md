---
id: T155
title: "Security review pass and headers audit"
phase: P9
status: done
owner: "claude"
type: test
size: M
deps: [T113, T025]
paths: [tests/security/]
refs: [WEB §8]
reqs: [NFR-SEC-06]
updated: 2026-10-28
---

# T155 — Security review pass and headers audit

## Goal
OWASP ASVS L2 checklist run: CSP, cookies, CSRF, SSRF, XSS corpus, authz matrix across two users, dependency audit, secrets scan.

## Acceptance
- [x] Checklist outcome logged
- [x] High findings fixed
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 20:59Z claimed by claude
- 2026-10-28 21:27Z Security pass: e2e suite on the real server (headers/CSP nonces, cookies, authn on every route, CSRF on every mutating route, two-user authz on every id route, SSRF, XSS in Chromium, error leakage), secrets scan, dependency audit. High findings fixed: nodemailer high advisories (upgraded to 10.2.1), API responses lacked no-store, unknown /api paths fell through to the app. Outcome table and gaps in docs/security-review.md (not a pen test; TLS/proxy and live OAuth deferred).
- 2026-10-28 21:27Z status -> done
