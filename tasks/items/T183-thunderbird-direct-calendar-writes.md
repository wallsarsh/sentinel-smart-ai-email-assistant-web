---
id: T183
title: "Thunderbird direct calendar writes with ICS fallback"
phase: P10
status: review
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T167, T176]
paths: [thunderbird/experiments/sentinel-calendar/, thunderbird/src/calendar.js, thunderbird/src/background.js, thunderbird/src/popup.js, thunderbird/manifest.json, tests/unit/thunderbird-assistant.test.ts]
refs: [ThunderAI calendar experiment; MOBILE-BRD §6.5]
reqs: [FR-TRI-06, FR-TRI-09]
updated: 2026-11-04
---

# T183 — Thunderbird direct calendar writes with ICS fallback

## Goal
Write a calendar candidate directly when the bundled calendar experiment is available, and keep the ICS download as a safe fallback.

## Acceptance
- [x] Minimal `sentinelCalendar` experiment lists writable calendars and creates events
- [x] Adapter uses direct write when available, ICS otherwise, and never duplicates a partially written batch
- [x] Popup/context menu report direct vs ICS result
- [x] ICS export remains available and tested
- [x] Manifest experiment paths are present

## Log
- 2026-11-04 15:29Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 15:29Z status -> done: implemented and covered by automated tests/build; real Thunderbird validation remains T174
- 2026-11-04 15:32Z status -> review: experimental calendar API needs real Thunderbird load validation; ICS fallback automated
