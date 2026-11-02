---
id: T170
title: "Thunderbird message popup redesign and sender shortcuts"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T166, T167]
paths: [thunderbird/src/popup.html, thunderbird/src/popup.js, thunderbird/src/ui.js, thunderbird/src/theme.css, tests/unit/thunderbird-assistant.test.ts]
refs: [MOBILE-BRD §6.5, MOBILE-ADD §10.2]
reqs: [FR-TRI-01, FR-TRI-05, FR-DRF-01, FR-SND-08]
updated: 2026-11-02
---

# T170 — Thunderbird message popup redesign and sender shortcuts

## Goal
Make the message popup a compact, useful card: what this mail is, what it asks, what Sentinel did, and what the user can do next.

## Acceptance
- [x] Popup shows subject, sender, intent, priority, summary, actions, calendar candidates and draft status
- [x] States: loading, cached, analysed, error, already replied, provider not configured
- [x] Actions: Analyse again, Draft reply, Save draft, Add to calendar, sender Important/Marketing/Ignore
- [x] Popup uses the shared design system and has no untrusted `innerHTML`
- [x] Popup remains usable at 320 px and with keyboard only
- [x] Tests cover formatting and quick-rule payloads

## Log
- 2026-11-02 12:30Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:30Z status -> done: implemented and covered by the Thunderbird Vitest suites; real-client validation remains T174
