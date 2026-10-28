---
id: T061
title: "Sync scheduling"
phase: P3
status: done
owner: "claude"
type: code
size: S
deps: [T060, T033]
paths: [server/jobs/sync.ts]
refs: [WEB §7]
reqs: [FR-BG-01]
updated: 2026-10-28
---

# T061 — Sync scheduling

## Goal
Per-user schedule (interval setting) plus on-demand "refresh now"; backoff on failures.

## Acceptance
- [x] Interval clamp 5/15/30/60
- [x] Manual refresh rate-limited
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:14Z claimed by claude
- 2026-10-28 13:17Z Sync scheduling: per-user interval (5/15/30/60 clamp) with period-keyed jobs, rate-limited refresh-now, retry-aware handler, provider factory, worker wiring + 1-minute scheduler tick
- 2026-10-28 13:17Z status -> done
