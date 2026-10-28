---
id: T061
title: "Sync scheduling"
phase: P3
status: todo
owner: ""
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
- [ ] Interval clamp 5/15/30/60
- [ ] Manual refresh rate-limited
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
