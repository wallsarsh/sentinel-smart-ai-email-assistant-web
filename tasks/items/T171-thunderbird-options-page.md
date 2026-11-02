---
id: T171
title: "Thunderbird options page and provider flow"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: S
deps: [T163]
paths: [thunderbird/src/options.html, thunderbird/src/options.js, thunderbird/src/theme.css, tests/unit/thunderbird-assistant.test.ts]
refs: [WEB §2, MOBILE-BRD §6.3]
reqs: [FR-AI-04, FR-AI-05, FR-SET-01]
updated: 2026-11-02
---

# T171 — Thunderbird options page and provider flow

## Goal
Make provider setup safe, understandable and minimal, and keep the existing key when the user only changes other settings.

## Acceptance
- [x] Options page validates HTTPS/localhost URL, requires model, and requests the provider origin permission
- [x] A blank key keeps the saved key; a new key replaces it; the full key is never shown again
- [x] Link to dashboard and a short explanation of data flow, no-send rule and token settings
- [x] Save reports status and preserves unrelated settings
- [x] Tests cover key preservation and settings merge

## Log
- 2026-11-02 12:30Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:30Z status -> done: implemented and covered by the Thunderbird Vitest suites; real-client validation remains T174
