---
id: T054
title: "Accounts UI"
phase: P2
status: done
owner: "claude"
type: code
size: L
deps: [T053, T008, T055]
paths: [app/pages/settings/accounts/, app/components/accounts/]
refs: [WEB §6, MOBILE-ADD §10.2]
reqs: [FR-ACC-04]
updated: 2026-10-28
---

# T054 — Accounts UI

## Goal
Account list, connect Gmail/Microsoft, IMAP setup wizard with autodiscovery, admin-consent help, folder picker, reconnect.

## Acceptance
- [x] Component and E2E (fake provider) tests
- [x] Accessible forms
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:08Z claimed by claude
- 2026-10-28 13:09Z Accounts UI: list, Gmail/Microsoft connect links with outcome messages, admin-consent help, IMAP wizard with autodiscovery/test/save, folder picker, AI-exclusion, reconnect, remove; labelled form fields; component tests with stubbed API. (Login pages and route guard land in T140.)
- 2026-10-28 13:09Z status -> done
