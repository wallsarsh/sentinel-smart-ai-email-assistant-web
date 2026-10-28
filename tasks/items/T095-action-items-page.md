---
id: T095
title: "Action items page"
phase: P5
status: done
owner: "claude"
type: code
size: M
deps: [T091, T008]
paths: [app/pages/actions.vue, server/api/actions/]
refs: [MOBILE-ADD §10.2]
reqs: [FR-ACT-01]
updated: 2026-10-28
---

# T095 — Action items page

## Goal
Today/upcoming/no-date/done groups, mark done, snooze to tomorrow, open source mail.

## Acceptance
- [x] Component and API tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:06Z claimed by claude
- 2026-10-28 15:10Z Action items: groups (today+overdue / upcoming / no date / snoozed / done) computed in the user's zone, mark done, reopen, snooze to 08:00 tomorrow (DST-safe), links to source mail, live refresh on triage.done; API + component + axe tests
- 2026-10-28 15:10Z status -> done
