---
id: T164
title: "Thunderbird extended message analysis"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T163]
paths: [thunderbird/src/prompts.js, thunderbird/src/ai.js, thunderbird/src/rules.js, tests/unit/thunderbird-assistant.test.ts, tests/unit/thunderbird-spike.test.ts]
refs: [PROMPTS §1, PROMPTS §2, MOBILE-BRD §6.5]
reqs: [FR-TRI-01, FR-TRI-07, FR-TRI-08]
updated: 2026-11-02
---

# T164 — Thunderbird extended message analysis

## Goal
Extend the shared triage call with intent, reply intent and calendar candidates while keeping the compact, defanged prompt envelope.

## Acceptance
- [x] A versioned `assistant.v1` prompt/schema requests intent, reply intent, action items and calendar candidates
- [x] `analyzeBatch` validates/repairs once, maps ids safely, computes priority in code and normalises missing enum values
- [x] Prompts contain no attachment contents and no quoted history; injection text stays inside the envelope
- [x] Existing summarize/draft/brief behaviour still works
- [x] Tests cover valid output, repair, unknown ids, intent fallback and calendar validation

## Log
- 2026-11-02 12:11Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:11Z status -> done: assistant.v1 prompt/schema and normalizeAnalysis added; tests green
