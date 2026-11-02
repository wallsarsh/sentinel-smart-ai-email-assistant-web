---
id: T165
title: "Thunderbird background inbox monitor"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: L
deps: [T164]
paths: [thunderbird/src/monitor.js, thunderbird/src/background.js, thunderbird/src/mail.js, thunderbird/src/tags.js, tests/unit/thunderbird-assistant.test.ts]
refs: [WEB §7, MOBILE-BRD §6.9, MOBILE-ADD §8]
reqs: [FR-BG-01, FR-BG-02, FR-BG-04, FR-TRI-02, FR-TRI-04]
updated: 2026-11-02
---

# T165 — Thunderbird background inbox monitor

## Goal
Keep watching inbox folders in the background, analyse only new and relevant mail, tag importance and expose a truthful run status.

## Acceptance
- [x] Monitor runs on an alarm, on `messages.onNewMailReceived` when available, and on manual refresh
- [x] Runs are incremental, deduplicated, self-message filtered and bounded by message/AI caps
- [x] Sender rules and bulk pre-filter run before any model call
- [x] Results are cached per message and importance is tagged best-effort when the tag API exists
- [x] Status records last/next run, counts, state and a content-free error
- [x] Tests cover incremental reuse, caps, rule skipping, failure continuation and no-send static guarantee

## Log
- 2026-11-02 12:30Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:30Z status -> done: implemented and covered by the Thunderbird Vitest suites; real-client validation remains T174
