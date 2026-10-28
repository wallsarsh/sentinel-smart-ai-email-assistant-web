---
id: T093
title: "Sender rules and corrections"
phase: P5
status: todo
owner: ""
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
- [ ] Global rules de-duplicated
- [ ] Hints bounded in size
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
