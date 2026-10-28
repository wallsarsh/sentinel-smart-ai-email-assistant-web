---
id: T027
title: "HTML sanitizer"
phase: P1
status: done
owner: "claude-sonnet-5-5"
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
- [x] XSS corpus passes (scripts, handlers, svg, css url())
- [x] Tracking pixels stripped when images off
- [x] Performance test on 1 MB body
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:41Z claimed by claude-sonnet-5-5
- 2026-10-28 10:42Z jsdom+DOMPurify allow-list sanitizer (core.mjs shared by inline and worker_threads for bodies >100KB): scripts/handlers/svg/math/iframe/form/css url()/@import/base/meta stripped, safe-CSS property allow-list, links rel/target hardened with scheme allow-list, remote images blocked with data-remote-src for opt-in, 1x1 trackers removed; 19-payload XSS corpus + 1.4MB perf test
- 2026-10-28 10:42Z status -> done
