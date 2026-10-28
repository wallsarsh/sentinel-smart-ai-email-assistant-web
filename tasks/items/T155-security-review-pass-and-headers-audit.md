---
id: T155
title: "Security review pass and headers audit"
phase: P9
status: todo
owner: ""
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
- [ ] Checklist outcome logged
- [ ] High findings fixed
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
