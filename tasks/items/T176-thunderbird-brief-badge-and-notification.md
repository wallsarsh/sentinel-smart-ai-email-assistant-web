---
id: T176
title: "Thunderbird brief update badge and native notification"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: S
deps: [T173]
paths: [thunderbird/src/notify.js, thunderbird/src/background.js, thunderbird/src/config.js, thunderbird/src/dashboard.html, thunderbird/src/dashboard.js, thunderbird/src/brief-popup.js, thunderbird/src/ui.js, tests/unit/thunderbird-assistant.test.ts]
refs: [MOBILE-BRD §6.6, MOBILE-BRD §6.9]
reqs: [FR-SUM-03, FR-BG-03]
updated: 2026-11-04
---

# T176 — Thunderbird brief update badge and native notification

## Goal
Make a brief update visible outside the popup: a count badge on the brief toolbar icon and a content-free native notification. Thunderbird has no separate tray API, so this is the platform-appropriate tray-adjacent indicator.

## Acceptance
- [x] Brief updates set a count badge on the brief toolbar action and a timestamp title
- [x] A native notification says only how many new messages are in the brief
- [x] Opening the dashboard or brief popup clears the badge via a `brief-seen` message
- [x] Notification can be switched off in dashboard settings; badge still updates
- [x] Badge/notification failures never fail a monitor run
- [x] Unit tests cover count clamping, badge calls, notification text and clearing

## Log
- 2026-11-04 15:10Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 15:10Z status -> done: implemented and covered by Thunderbird tests; manual real-client validation remains T174
