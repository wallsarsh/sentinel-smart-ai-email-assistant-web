---
id: T186
title: "Thunderbird monitor Local Folders and demo mailbox"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: S
deps: [T165, T185]
paths: [thunderbird/src/mail.js, thunderbird/src/background.js, thunderbird/src/monitor.js, thunderbird/src/brief.js, thunderbird/src/config.js, thunderbird/src/dashboard.html, thunderbird/src/dashboard.js, thunderbird/docs/demo-mail.md]
refs: [thunderbird/docs/demo-mail.md, T185]
reqs: [FR-TRI-01, FR-SUM-01]
updated: 2026-11-04
---

# T186 — Thunderbird monitor Local Folders and demo mailbox

## Goal
Make the monitor and brief include Local Folders mailboxes, so demo mail installed by T185 is analysed and appears in the brief.

## Acceptance
- [x] Local Folders mailboxes are scanned by default, excluding Drafts/Sent/Trash/Junk/Outbox/Templates/Archives
- [x] Dashboard setting can switch Local Folders scanning off
- [x] Monitor and brief pass the setting through to the folder collector
- [x] Demo-mail docs mention the setting and the Local Folders mailbox
- [x] Tests/build/lint pass

## Log
- 2026-11-04 16:25Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 16:25Z status -> done: Local Folders scanning enabled by default; 84 tests/build/lint pass
