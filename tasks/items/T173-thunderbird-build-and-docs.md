---
id: T173
title: "Thunderbird manifest, build, docs and automated smoke"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T169, T170, T171, T172]
paths: [thunderbird/manifest.json, thunderbird/README.md, tools/build-extension.mjs, tests/unit/thunderbird-spike.test.ts, tests/unit/thunderbird-assistant.test.ts]
refs: [WEB §2, CONV §10]
reqs: [NFR-SEC-10, NFR-MNT-03]
updated: 2026-11-02
---

# T173 — Thunderbird manifest, build, docs and automated smoke

## Goal
Ship a complete, reviewable add-on bundle with the minimum permissions and honest documentation.

## Acceptance
- [x] Manifest declares only used permissions; no `compose.send`/`messages.send`
- [x] Build emits popup, options, background, brief and dashboard entries plus shared CSS
- [x] Built bundle has no `eval`, `new Function` or Node imports
- [x] README explains setup, monitoring, drafts, rules, calendar export, limitations and manual validation
- [x] Targeted Vitest suites, lint and send-gate pass
- [x] `thunderbird/dist` rebuilt from source and reviewed

## Log
- 2026-11-02 12:30Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:30Z status -> done: implemented and covered by the Thunderbird Vitest suites; real-client validation remains T174
