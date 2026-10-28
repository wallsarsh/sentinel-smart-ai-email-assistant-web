---
id: T109
title: "Send records and reconcile"
phase: P6
status: done
owner: "claude"
type: code
size: M
deps: [T106, T107, T108]
paths: [server/mail/send/records.ts]
refs: [MOBILE-ADD §9.4]
reqs: [FR-SND-05]
updated: 2026-10-28
---

# T109 — Send records and reconcile

## Goal
pending, submitting, sent, failed, unknown states; reconcile unknown by Message-ID in Sent; no bodies stored.

## Acceptance
- [x] State machine tests
- [x] Reconcile never re-sends
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 16:04Z claimed by claude
- 2026-10-28 16:13Z Send records: transition table is the single source of legal moves (all 36 combinations tested), metadata-only columns asserted, recorder + reconcileUnknown (search-only: settles found sends, never submits)
- 2026-10-28 16:13Z status -> done
