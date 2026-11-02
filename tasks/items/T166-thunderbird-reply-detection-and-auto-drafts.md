---
id: T166
title: "Thunderbird reply detection and reviewable auto-drafts"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: L
deps: [T164]
paths: [thunderbird/src/drafts.js, thunderbird/src/background.js, thunderbird/src/mail.js, tests/unit/thunderbird-assistant.test.ts]
refs: [MOBILE-BRD §6.4, MOBILE-ADD §9.4, WEB §2]
reqs: [FR-DRF-01, FR-DRF-03, FR-DRF-09, FR-SND-08, BR-01]
updated: 2026-11-02
---

# T166 — Thunderbird reply detection and reviewable auto-drafts

## Goal
Create at most a few reviewable drafts for messages that need a reply, save them to the account's own Drafts folder and never duplicate a reply.

## Acceptance
- [x] Eligibility excludes newsletters, notifications, social, security, ignored senders, old mail, low priority and already-handled threads
- [x] Reply index checks Sent and Drafts folders by `In-Reply-To`/`References`, with cache and bounded scan
- [x] Drafts are generated with tone/sign-off/reply intent and saved as threaded drafts; no send API is used
- [x] Per-run cap, idempotency key and local draft log prevent duplicates
- [x] Manual "save draft" path warns when a reply already exists
- [x] Tests cover eligibility, reply matching, cap, failure and no-send manifest guarantee

## Log
- 2026-11-02 12:30Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:30Z status -> done: implemented and covered by the Thunderbird Vitest suites; real-client validation remains T174
