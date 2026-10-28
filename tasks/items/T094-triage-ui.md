---
id: T094
title: "Triage UI"
phase: P5
status: done
owner: "claude"
type: code
size: L
deps: [T091, T093, T064, T065]
paths: [app/components/triage/, app/pages/settings/senders.vue]
refs: [MOBILE-ADD §10.2]
reqs: [FR-TRI-06]
updated: 2026-10-28
---

# T094 — Triage UI

## Goal
AI card on messages (summary, priority, reason, correct menu, "AI can make mistakes"), priority chips with text, sender rules screen.

## Acceptance
- [x] Priority conveyed by text not colour only
- [x] Component tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:01Z claimed by claude
- 2026-10-28 15:05Z Triage UI: AI card on message detail (summary, written-out priority chip, reason, 'AI can make mistakes' / 'sorted by a rule', correct menu with sender memory), priority chips in inbox rows, senders page (VIP/mute add/remove), corrections service + API; component + axe tests
- 2026-10-28 15:05Z status -> done
