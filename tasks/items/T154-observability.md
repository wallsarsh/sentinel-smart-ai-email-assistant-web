---
id: T154
title: "Observability"
phase: P9
status: todo
owner: ""
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
- [ ] Scrub test
- [ ] Metrics cardinality bounded
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
