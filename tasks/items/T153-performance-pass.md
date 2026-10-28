---
id: T153
title: "Performance pass"
phase: P9
status: todo
owner: ""
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
- [ ] Numbers recorded in the log
- [ ] Budgets enforced in CI
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
