---
id: T163
title: "Thunderbird reusable assistant domain modules"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T162]
paths: [thunderbird/src/config.js, thunderbird/src/rules.js, thunderbird/src/store.js, tests/unit/thunderbird-assistant.test.ts]
refs: [WEB §2, WEB §7, MOBILE-BRD §6.5, MOBILE-BRD §9]
reqs: [FR-TRI-02, FR-TRI-04, FR-TRI-05, FR-SET-03]
updated: 2026-11-02
---

# T163 — Thunderbird reusable assistant domain modules

## Goal
Create pure, testable modules for settings migration, sender rules and storage access that every extension surface can reuse.

## Acceptance
- [x] `config.js` provides defaults, validation, normalisation and legacy `briefSettings` migration
- [x] `rules.js` matches exact addresses, domains and subdomains with documented precedence
- [x] `rules.js` implements ignore/marketing/important/normal policy, bulk pre-filter and local marketing analysis
- [x] `store.js` owns storage keys, cache get/set, 14-day pruning, draft-log cap and monitor/brief status helpers
- [x] Unit tests cover rule precedence, pre-filter, settings migration and storage caps
- [x] Targeted Vitest suite green

## Log
- 2026-11-02 12:10Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:10Z status -> done: config/rules/store added; 16 unit tests green
