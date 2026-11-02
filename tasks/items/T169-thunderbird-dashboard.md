---
id: T169
title: "Thunderbird dashboard shell and five views"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: L
deps: [T165, T166, T167, T168]
paths: [thunderbird/src/dashboard.html, thunderbird/src/dashboard.js, thunderbird/src/ui.js, thunderbird/src/theme.css, tools/build-extension.mjs, tests/unit/thunderbird-assistant.test.ts]
refs: [WEB §6, MOBILE-TEST §4]
reqs: [FR-TRI-03, FR-TRI-06, FR-DRF-02, FR-SET-01, NFR-UX-01]
updated: 2026-11-02
---

# T169 — Thunderbird dashboard shell and five views

## Goal
Give the assistant a calm, single home for Brief, Inbox, Drafts, Senders and Settings.

## Acceptance
- [x] Dashboard opens in a tab and has accessible Brief/Inbox/Drafts/Senders/Settings views
- [x] Brief shows headline, stats, sections and open links; Inbox filters by needs reply/P1/important/bulk/ignored
- [x] Drafts lists created drafts with source, status, time and open action
- [x] Senders adds/removes rules with validation and quick kinds
- [x] Settings edits monitoring, auto-draft, marketing opt-in, brief and tagging controls
- [x] Shared `ui.js` inserts model/mail text as text only; no `innerHTML` for untrusted data
- [x] Build includes dashboard entry and shared stylesheet

## Log
- 2026-11-02 12:30Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:30Z status -> done: implemented and covered by the Thunderbird Vitest suites; real-client validation remains T174
