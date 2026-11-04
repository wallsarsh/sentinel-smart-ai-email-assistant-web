---
id: T184
title: "Thunderbird context menus and message-list actions"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T181]
paths: [thunderbird/src/background.js, thunderbird/manifest.json, tests/unit/thunderbird-spike.test.ts]
refs: [ThunderAI context menus; AI Mail Support message/compose menus]
reqs: [FR-TRI-05, FR-DRF-01, FR-TRI-06]
updated: 2026-11-04
---

# T184 — Thunderbird context menus and message-list actions

## Goal
Expose Sentinel actions on Thunderbird’s native message list and message display without duplicating the dashboard.

## Acceptance
- [x] Sentinel submenu appears on message list and message display
- [x] Actions: Analyze selected, Create draft reply, Add to calendar, sender Important/Marketing/Ignore/Normal
- [x] Message-list multi-selection is bounded and uses the batch paths
- [x] Errors are reported without mail content
- [x] `menus` permission is declared and tested

## Log
- 2026-11-04 15:29Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 15:29Z status -> done: implemented and covered by automated tests/build; real Thunderbird validation remains T174
