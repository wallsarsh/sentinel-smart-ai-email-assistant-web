---
id: T028
title: "Link guard"
phase: P1
status: done
owner: "claude-sonnet-5-5"
type: code
size: S
deps: [T005]
paths: [shared/link-guard.ts]
refs: [MOBILE-ADD §7.2]
reqs: [NFR-SEC-08]
updated: 2026-10-28
---

# T028 — Link guard

## Goal
Scheme allow-list and warnings for IP hosts, punycode, userinfo, http, text/href mismatch.

## Acceptance
- [x] Unit tests mirror mobile fixtures
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:42Z claimed by claude-sonnet-5-5
- 2026-10-28 10:43Z assessLink port (ip host, punycode, http, userinfo, port, text mismatch; non-web schemes refused); UI dialog comes with T065
- 2026-10-28 10:43Z status -> done
