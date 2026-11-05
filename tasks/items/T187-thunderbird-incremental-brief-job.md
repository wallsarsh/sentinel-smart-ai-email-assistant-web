---
id: T187
title: "Thunderbird incremental resumable daily brief"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: L
deps: [T168, T186]
paths: [thunderbird/src/brief.js, thunderbird/src/store.js, thunderbird/src/background.js, thunderbird/src/dashboard.js, thunderbird/src/brief-popup.js, thunderbird/src/theme.css, tests/unit/thunderbird-assistant.test.ts]
refs: [MOBILE-BRD §6.6, MOBILE-ADD §5.3]
reqs: [FR-SUM-01, FR-SUM-02]
updated: 2026-11-05
---

# T187 — Thunderbird incremental resumable daily brief

## Goal
Build the brief one email at a time, persist progress after each message, resume after provider failure or app restart, and update counts/dashboard while it runs.

## Acceptance
- [x] Each brief email is analysed in its own provider call, not one monolithic batch
- [x] Analysis records `briefAt`/`briefWindow`; processed mail is skipped on resume
- [x] `sentinel.briefJob` stores total/processed/analyzed/cached/local/failed/current/error
- [x] Partial brief and status are saved after every message; dashboard shows progress and counts
- [x] A failed message is left unmarked, retried on the next refresh; three consecutive failures pause the job
- [x] Summary generation runs only after all messages succeed; summary failure preserves processed analyses
- [x] Brief popup has a brief-only refresh path, so a stalled monitor cannot block it
- [x] Tests cover per-message progress, resume and cached analyses

## Log
- 2026-11-05 02:39Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-05 02:39Z status -> done: iterative brief job with durable progress/resume; 88 tests pass
