---
id: T177
title: "Thunderbird reply-view assistant with intent, length and preview"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T175]
paths: [thunderbird/src/compose.html, thunderbird/src/compose.js, thunderbird/src/tones.js, thunderbird/src/theme.css, tests/unit/thunderbird-assistant.test.ts]
refs: [MOBILE-BRD §6.4, ThunderAI compose/action design, AI Mail Support reply menus]
reqs: [FR-DRF-01, FR-DRF-02, FR-DRF-07]
updated: 2026-11-04
---

# T177 — Thunderbird reply-view assistant with intent, length and preview

## Goal
Make the reply compose window a real Sentinel assistant surface: original-message analysis, tone, reply intent, length, optional instruction, editable preview, insert and copy.

## Acceptance
- [x] Compose popup shows the original message priority, intent, category, summary, reason and action items when analysed
- [x] Tone presets remain Standard…Persuasive
- [x] Reply intent selector: Acknowledge, Accept, Decline, Ask for details, Custom
- [x] Length selector: Short, Standard, Detailed; combines with the instruction
- [x] Generate produces an editable preview; Insert writes it above the quote; Copy works
- [x] No send call; generation failure leaves the compose window untouched
- [x] Tone/request composition is unit tested

## Log
- 2026-11-04 15:10Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 15:10Z status -> done: implemented and covered by Thunderbird tests; manual real-client validation remains T174
