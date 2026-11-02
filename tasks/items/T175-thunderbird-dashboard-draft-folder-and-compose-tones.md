---
id: T175
title: "Thunderbird dashboard URL, IMAP draft identity and compose tone action"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T173]
paths: [thunderbird/src/dashboard.js, thunderbird/src/ui.js, thunderbird/src/background.js, thunderbird/src/drafts.js, thunderbird/src/compose.js, thunderbird/src/compose.html, thunderbird/src/tones.js, thunderbird/manifest.json, tools/build-extension.mjs, tests/unit/thunderbird-assistant.test.ts]
refs: [thunderbird/docs/requirements.md, MOBILE-BRD §6.4, WEB §2]
reqs: [FR-DRF-02, FR-DRF-03, FR-SET-01]
updated: 2026-11-02
---

# T175 — Thunderbird dashboard URL, IMAP draft identity and compose tone action

## Goal
Fix the issues found in the first real Thunderbird test: blank dashboard, drafts landing in Local Folders, and no Sentinel action in the reply compose window.

## Acceptance
- [x] Dashboard opens the built `dist/dashboard.html` path from every entry point
- [x] Auto-drafts and manual drafts use the identity of the message's account, so compose saves into that account's Drafts folder
- [x] Draft log records the folder name for verification
- [x] Reply compose windows expose a Sentinel compose action with Standard, Professional, Friendly, Concise, Formal, Creative, Casual, Apologetic and Persuasive tones
- [x] Compose action inserts a reviewable draft above the quote and never sends
- [x] Targeted tests, lint, build and send-gate pass
- [x] Changes committed and pushed to the PR branch

## Log
- 2026-11-02 15:09Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 15:09Z status -> done: dashboard path fixed; drafts use account identity; compose action with 9 tones; 70 tests/build/lint/send-gate green
