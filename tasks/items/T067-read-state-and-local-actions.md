---
id: T067
title: "Read state and local actions"
phase: P3
status: done
owner: "claude"
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
- [x] No provider write calls (test)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:24Z claimed by claude
- 2026-10-28 13:27Z Local read/unread (PUT /api/messages/:id/read) and message+thread GET; source-scan test proves routes import no provider/OAuth/send code (container only for useDb), so no mailbox writes
- 2026-10-28 13:27Z status -> done
