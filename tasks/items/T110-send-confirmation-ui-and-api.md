---
id: T110
title: "Send confirmation UI and API"
phase: P6
status: done
owner: "claude"
type: code
size: L
deps: [T105, T102, T109]
paths: [app/components/send/, server/api/send/]
refs: [MOBILE-ADD §10.2]
reqs: [FR-SND-01]
updated: 2026-10-28
---

# T110 — Send confirmation UI and API

## Goal
Confirmation dialog showing recipients, subject and full body; must scroll to end; placeholders block unless overridden; new/external recipients and foreign links flagged; issues the authorization from the explicit click only.

## Acceptance
- [x] Send disabled until conditions met (tests)
- [x] Authorization endpoint accepts only a direct user action (CSRF + step-up)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 16:14Z claimed by claude
- 2026-10-28 16:24Z Send confirmation: prepare (saves draft, returns exact content + flags for new/external recipients, foreign details, placeholders), authorize (previewHash must equal rebuilt content, step-up via two-factor or password, only issues authorization - never sends), undo/status endpoints, confirmation dialog (must scroll to end, placeholder override, password), undo bar; migration 0005
- 2026-10-28 16:24Z status -> done
