---
id: T100
title: "Writing profile"
phase: P6
status: done
owner: "claude"
type: code
size: S
deps: [T031]
paths: [app/pages/settings/profile.vue, server/api/profile/]
refs: [MOBILE-ADD §10.2]
reqs: [FR-DRF-01]
updated: 2026-10-28
---

# T100 — Writing profile

## Goal
Name, role, sign-off, signature, style notes, language.

## Acceptance
- [x] Profile feeds user-context builder (test)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:11Z claimed by claude
- 2026-10-28 15:15Z Writing profile: name/timezone on the user, role/sign-off/signature/style/language as settings, shared buildUserContext feeding triage and draft prompts (test), profile page + API with validation
- 2026-10-28 15:15Z status -> done
