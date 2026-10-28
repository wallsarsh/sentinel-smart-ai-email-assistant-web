---
id: T154
title: "Observability"
phase: P9
status: done
owner: "claude"
type: code
size: S
deps: [T006, T033]
paths: [server/observability/]
refs: [WEB §8]
reqs: [NFR-MNT-05]
updated: 2026-10-28
---

# T154 — Observability

## Goal
Health/readiness endpoints, Prometheus metrics (no content or addresses), job queue gauges, opt-in error reporting with scrubbing.

## Acceptance
- [x] Scrub test
- [x] Metrics cardinality bounded
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 20:35Z claimed by claude
- 2026-10-28 20:59Z Observability: /api/ready, token-protected Prometheus /api/metrics (route patterns from an allow-list checked against server/api, status classes, job queue depth/age, capped at 300 series), opt-in scrubbed error reporting (operator URL + per-user setting); scrub, cardinality and endpoint auth tests incl. against the real server.
- 2026-10-28 20:59Z status -> done
