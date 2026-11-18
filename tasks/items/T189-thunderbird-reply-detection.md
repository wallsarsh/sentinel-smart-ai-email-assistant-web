---
id: T189
title: "Thunderbird Sent Items reply detection and brief awareness"
phase: P10
status: review
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T168, T176]
paths: [thunderbird/src/replies.js, thunderbird/src/drafts.js, thunderbird/src/background.js, thunderbird/src/brief.js, thunderbird/src/analysis.js, thunderbird/src/dashboard.js, thunderbird/src/popup.js, thunderbird/src/brief-view.js, tests/unit/thunderbird-replies.test.ts]
refs: [thunderbird/docs/requirements.md#4.3, thunderbird/docs/reliability-ux-and-updates.md]
reqs: [TB-DRF-02, TB-BRF-09]
updated: 2026-11-18
---

# T189 — Thunderbird Sent Items reply detection and brief awareness

## Goal
Mark inbox messages that already have an answer in Sent Items, keep the marker durable, and make the daily brief and dashboard count answered mail accurately.

## Acceptance
- [x] Sent Items are indexed by the Message-IDs in `In-Reply-To`/`References`; the scan is incremental and cached per account
- [x] An answered analysis stores `replied`, `repliedAt` and `repliedMessageId`; normalisation preserves them
- [x] Draft eligibility refuses a message whose stored analysis is already replied, in addition to the live Sent/Drafts check
- [x] Monitor runs and brief rebuilds refresh markers; a 14-day sweep updates stored analyses without a new AI call
- [x] Brief stats add `replied`; `needsReply` counts only unanswered mail; answered mail without actions is not listed
- [x] Popup shows Replied and hides the draft action; dashboard adds a Replied chip and filter
- [x] Today’s stored brief counts are recomputed after markers change, without another summary call
- [x] Unit tests cover header correlation, marker durability, draft blocking and reply-aware brief stats

## Log
- 2026-11-18 claimed by opencode-deepseek-v4.1-flash
- 2026-11-18 implemented and covered by tests; real Sent Items/IMAP sync validation remains part of T174.
