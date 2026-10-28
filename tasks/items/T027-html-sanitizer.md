---
id: T027
title: "HTML sanitizer"
phase: P1
status: todo
owner: ""
type: code
size: M
deps: [T005]
paths: [server/mail/sanitize/]
refs: [MOBILE-ADD §7.2, WEB §8]
reqs: [NFR-SEC-08]
updated: 2026-10-28
---

# T027 — HTML sanitizer

## Goal
Allow-list sanitizer (jsdom + DOMPurify config) producing safe HTML with remote images blocked by default and rewritten for opt-in loading; large bodies handled in a worker thread.

## Acceptance
- [ ] XSS corpus passes (scripts, handlers, svg, css url())
- [ ] Tracking pixels stripped when images off
- [ ] Performance test on 1 MB body
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
