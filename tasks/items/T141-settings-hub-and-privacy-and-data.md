---
id: T141
title: "Settings hub and privacy and data"
phase: P8
status: done
owner: "claude"
type: code
size: M
deps: [T030, T032, T031]
paths: [app/pages/settings/]
refs: [MOBILE-ADD §10.2]
reqs: [FR-SET-03, FR-SET-04]
updated: 2026-10-28
---

# T141 — Settings hub and privacy and data

## Goal
Settings sections; AI scope (body/subject), char cap, redaction toggles, per-account exclusion, retention, clear cache, export, delete account.

## Acceptance
- [x] Changes apply to next AI call (test)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 18:14Z claimed by claude
- 2026-10-28 18:26Z Settings hub with sign-out; Privacy & data page: AI scope (subject only/body), char cap, redaction toggles, per-account AI exclusion, retention, clear cached mail, export (step-up), delete account. All AI features now build prompts from the current privacy settings (drafts and brief previously ignored redaction); test proves changes apply to the next AI call.
- 2026-10-28 18:26Z status -> done
