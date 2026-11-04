---
id: T179
title: "Thunderbird proofread and rewrite with accept/reject diff"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: L
deps: [T177]
paths: [thunderbird/src/compose.js, thunderbird/src/compose.html, thunderbird/src/compose-script.js, thunderbird/src/selection.js, thunderbird/src/diff.js, thunderbird/src/prompts.js, thunderbird/src/theme.css, tests/unit/thunderbird-assistant.test.ts]
refs: [ThunderAI compose/proofread; AI Mail Support rephrase; MOBILE-BRD §6.4]
reqs: [FR-DRF-02, FR-DRF-07]
updated: 2026-11-04
---

# T179 — Thunderbird proofread and rewrite with accept/reject diff

## Goal
Let the user select text in a reply, proofread or rewrite it, review word-level changes, and apply only the accepted changes.

## Acceptance
- [x] Compose content script exposes selection read and replacement
- [x] Proofread and rewrite use their own task routes and static, delimited prompts
- [x] Diff groups changed words into hunks with original and suggestion
- [x] Each hunk can be accepted or rejected; apply uses only accepted hunks
- [x] Diff/decision logic is unit tested; no send path

## Log
- 2026-11-04 15:29Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 15:29Z status -> done: implemented and covered by automated tests/build; real Thunderbird validation remains T174
