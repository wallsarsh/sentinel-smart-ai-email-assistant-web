---
id: T067
title: "Read state and local actions"
phase: P3
status: todo
owner: ""
type: code
size: S
deps: [T062]
paths: [server/api/messages/]
refs: [MOBILE-ADD §4]
reqs: [FR-READ-07]
updated: 2026-10-28
---

# T067 — Read state and local actions

## Goal
Mark read/unread locally (never changes the mailbox in v1), archive-free by design.

## Acceptance
- [ ] No provider write calls (test)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
