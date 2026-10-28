---
id: T090
title: "Pre-filter and priority matrix"
phase: P5
status: done
owner: "claude"
type: code
size: M
deps: [T005]
paths: [server/triage/]
refs: [MOBILE-ADD §5.3]
reqs: [FR-TRI-01]
updated: 2026-10-28
---

# T090 — Pre-filter and priority matrix

## Goal
Deterministic rules (muted, bulk, security, excluded accounts) and importance x urgency to P1-P4.

## Acceptance
- [x] Table tests parity with mobile
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:35Z claimed by claude
- 2026-10-28 14:39Z Pre-filter (excluded > mute > security > VIP > bulk > automated) ported with parity tests, priority matrix table test; Precedence/Auto-Submitted headers now parsed by all providers and stored (migration 0003)
- 2026-10-28 14:39Z status -> done
