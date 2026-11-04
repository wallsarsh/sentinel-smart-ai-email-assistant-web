---
id: T181
title: "Thunderbird batch processing from the inbox"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T177]
paths: [thunderbird/src/dashboard.js, thunderbird/src/dashboard.html, thunderbird/src/background.js, tests/unit/thunderbird-assistant.test.ts]
refs: [ThunderAI batch processing; MOBILE-BRD §6.5]
reqs: [FR-TRI-01, FR-DRF-01]
updated: 2026-11-04
---

# T181 — Thunderbird batch processing from the inbox

## Goal
Select several analysed messages in the dashboard and run analysis or draft generation as a bounded batch.

## Acceptance
- [x] Inbox rows can be selected without losing the Open action
- [x] Batch bar shows count and Analyze selected / Create drafts / Clear
- [x] Analyze processes up to 10 messages, drafts up to 5, and reports counts/errors
- [x] Rules, caching and draft idempotency still apply
- [x] Selection and batch result survive re-render

## Log
- 2026-11-04 15:29Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 15:29Z status -> done: implemented and covered by automated tests/build; real Thunderbird validation remains T174
