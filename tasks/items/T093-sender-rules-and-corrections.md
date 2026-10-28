---
id: T093
title: "Sender rules and corrections"
phase: P5
status: done
owner: "claude"
type: code
size: M
deps: [T021]
paths: [server/repos/sender-rules.ts, server/api/rules/]
refs: [MOBILE-ADD §5.3]
reqs: [FR-TRI-04, FR-TRI-05]
updated: 2026-10-28
---

# T093 — Sender rules and corrections

## Goal
VIP/mute rules (address or @domain, global or per account) and importance corrections turned into prompt hints.

## Acceptance
- [x] Global rules de-duplicated
- [x] Hints bounded in size
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:47Z claimed by claude
- 2026-10-28 14:54Z Sender rules repo + API: address/@domain VIP and mute (global or per account), opposite-rule replacement, de-duplication (global supersedes account copies), importance corrections as bounded prompt hints (10 x 160 chars, newest first), per-user isolation
- 2026-10-28 14:54Z status -> done
