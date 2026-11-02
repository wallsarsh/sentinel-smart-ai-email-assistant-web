---
id: T168
title: "Thunderbird hourly daily-brief refresh"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T165]
paths: [thunderbird/src/brief.js, thunderbird/src/brief-view.js, thunderbird/src/background.js, tests/unit/thunderbird-spike.test.ts, tests/unit/thunderbird-assistant.test.ts]
refs: [PROMPTS §3, MOBILE-BRD §6.6, WEB §7]
reqs: [FR-SUM-01, FR-SUM-02, FR-SUM-03]
updated: 2026-11-02
---

# T168 — Thunderbird hourly daily-brief refresh

## Goal
Keep one daily brief for the current local day, refresh it after monitor runs that found new mail, and let the user refresh it at will.

## Acceptance
- [x] Brief window starts at local midnight and ends at generation time
- [x] Monitor refreshes the brief only when new mail was analysed; repeated runs do not re-buy the brief
- [x] Manual refresh works from the brief popup and dashboard
- [x] Brief items link only to real messages and counts come from stored analyses
- [x] Status shows generated time, update state and content-free errors
- [x] Tests cover window, reuse, manual refresh and unknown-id filtering

## Log
- 2026-11-02 12:30Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:30Z status -> done: implemented and covered by the Thunderbird Vitest suites; real-client validation remains T174
