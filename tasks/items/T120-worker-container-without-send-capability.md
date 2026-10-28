---
id: T120
title: "Worker container without send capability"
phase: P7
status: done
owner: "claude"
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
- [x] Test asserts resolution fails
- [x] Send-gate check covers worker
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 16:54Z claimed by claude
- 2026-10-28 17:00Z Worker container: read-only providers, AI stack and triage; resolving any send-related or unknown service throws CapabilityError (tested for each forbidden name); no worker file may import the send module, draft saving or the web container; send-gate check covers worker
- 2026-10-28 17:00Z status -> done
