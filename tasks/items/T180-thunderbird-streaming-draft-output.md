---
id: T180
title: "Thunderbird streaming draft output"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T177]
paths: [thunderbird/src/ai.js, thunderbird/src/compose.js, tests/unit/thunderbird-assistant.test.ts]
refs: [AI Mail Support streaming output; MOBILE-BRD §7.3]
reqs: [FR-DRF-02, NFR-PERF-04]
updated: 2026-11-04
---

# T180 — Thunderbird streaming draft output

## Goal
Stream generated reply text into the compose preview instead of waiting for one completion.

## Acceptance
- [x] `draftReplyStream` uses the provider stream and calls a delta callback
- [x] Falls back to a normal completion when the adapter cannot stream
- [x] Compose preview updates while text arrives and remains editable
- [x] Stream errors are readable and do not send or close the compose window

## Log
- 2026-11-04 15:29Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 15:29Z status -> done: implemented and covered by automated tests/build; real Thunderbird validation remains T174
