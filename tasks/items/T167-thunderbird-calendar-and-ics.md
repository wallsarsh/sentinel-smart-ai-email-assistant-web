---
id: T167
title: "Thunderbird calendar candidates and ICS export"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T164]
paths: [thunderbird/src/calendar.js, thunderbird/src/background.js, tests/unit/thunderbird-assistant.test.ts]
refs: [MOBILE-BRD §6.5, MOBILE-BRD §3.2]
reqs: [FR-TRI-06, FR-TRI-09]
updated: 2026-11-02
---

# T167 — Thunderbird calendar candidates and ICS export

## Goal
Turn meeting/dated-action analysis into reviewable calendar candidates and export standards-compliant ICS files only after a click.

## Acceptance
- [x] Calendar candidates come from explicit events and from action items with a due date
- [x] Invalid or unparseable dates are dropped; timed and all-day events are normalised
- [x] ICS output escapes text, uses UTC/date values, stable UIDs and is valid for Thunderbird/Google/Outlook
- [x] Download uses the downloads API and reports a clear error when unavailable
- [x] Tests cover normalisation, all-day vs timed, escaping and no automatic download

## Log
- 2026-11-02 12:30Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:30Z status -> done: implemented and covered by the Thunderbird Vitest suites; real-client validation remains T174
