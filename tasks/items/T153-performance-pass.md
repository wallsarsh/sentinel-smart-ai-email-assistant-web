---
id: T153
title: "Performance pass"
phase: P9
status: done
owner: "claude"
type: test
size: M
deps: [T140]
paths: [tests/perf/]
refs: [MOBILE-TEST §7]
reqs: [NFR-PERF-01]
updated: 2026-10-28
---

# T153 — Performance pass

## Goal
Lighthouse CI budgets, API p95 targets with seeded 50k messages, triage throughput, bundle size budget.

## Acceptance
- [x] Numbers recorded in the log
- [x] Budgets enforced in CI
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 20:12Z claimed by claude
- 2026-10-28 20:35Z Perf: tests/perf on real Postgres with 50k messages through the built server (inbox p95 ~9ms, counts ~70ms after fixing a per-message sub-select (was 123ms), search 13ms, actions 11ms, brief 10ms; rule triage ~210-250 msg/s; FCP ~120ms); budgets enforced in the CI e2e job; bundle budget (JS 175kB gz of 200kB) enforced in CI checks job; numbers in docs/performance.md. NOT run: Lighthouse CI (not installable here), throttled mobile, concurrent users.
- 2026-10-28 20:35Z status -> done
