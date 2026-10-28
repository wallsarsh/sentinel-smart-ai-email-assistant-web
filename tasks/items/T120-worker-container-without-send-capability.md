---
id: T120
title: "Worker container without send capability"
phase: P7
status: todo
owner: ""
type: code
size: M
deps: [T033, T105]
paths: [worker/container.ts]
refs: [MOBILE-ADD §8.2, WEB §7]
reqs: [FR-BG-10]
updated: 2026-10-28
---

# T120 — Worker container without send capability

## Goal
Worker DI container that cannot resolve senders, SendGate, or draft-save use cases (resolution throws).

## Acceptance
- [ ] Test asserts resolution fails
- [ ] Send-gate check covers worker
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
