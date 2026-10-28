---
id: T082
title: "AI test bench"
phase: P4
status: done
owner: "claude"
type: code
size: M
deps: [T079, T080]
paths: [app/pages/settings/ai/bench.vue, server/api/ai/bench.post.ts]
refs: [MOBILE-ADD §10.2]
reqs: [FR-AI-11]
updated: 2026-10-28
---

# T082 — AI test bench

## Goal
Synthetic samples only, compare two models side by side with tokens, latency, cost.

## Acceptance
- [x] No real mail path (test)
- [x] Calls count toward usage
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:31Z claimed by claude
- 2026-10-28 14:35Z AI test bench: synthetic triage samples compared on two provider/model pairs (tokens, latency, cost, JSON validity), goes through the gateway (consent + usage), source-scan test proves no mail/repo access; UI page
- 2026-10-28 14:35Z status -> done
