---
id: T078
title: "AI consent flow UI"
phase: P4
status: done
owner: "claude"
type: code
size: M
deps: [T074, T077]
paths: [app/pages/settings/ai/consent.vue]
refs: [MOBILE-BRD BR-02]
reqs: [FR-AI-04]
updated: 2026-10-28
---

# T078 — AI consent flow UI

## Goal
Plain-language consent per provider showing what is sent and where; revoke.

## Acceptance
- [x] Consent timestamp stored
- [x] Revocation stops calls immediately
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:22Z claimed by claude
- 2026-10-28 14:24Z AI consent: plain-language page per provider (what is sent / not sent / where), consent timestamp stored via PUT consent, revoke stops the next gateway call (test)
- 2026-10-28 14:24Z status -> done
