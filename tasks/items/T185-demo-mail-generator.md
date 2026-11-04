---
id: T185
title: "Demo mail generator with Thunderbird Local Folders import"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: tool
size: M
deps: [T173]
paths: [tools/generate-demo-mail.mjs, tests/unit/demo-mail.test.ts, thunderbird/docs/demo-mail.md, package.json, .gitignore]
refs: [MOBILE-TEST §2, MOBILE-TEST §4]
reqs: [NFR-MNT-03]
updated: 2026-11-04
---

# T185 — Demo mail generator with Thunderbird Local Folders import

## Goal
Create realistic, threaded test mail for a busy non-profit IT head and install it into Thunderbird Local Folders without manual conversion.

## Acceptance
- [x] Generates a deterministic-seeded mix of requests, meetings, finance, security, vendor, helpdesk, grant, HR, newsletter, social and phishing mail
- [x] Creates threads with Message-ID, In-Reply-To, References and Re: subjects
- [x] Supports days, weeks, months and explicit start/end ranges
- [x] Writes EML files, an mbox and a manifest
- [x] `--apply` appends or replaces a Local Folders mailbox, refuses a locked profile and removes the stale .msf
- [x] Unit tests cover ranges, determinism, threading, MIME/mbox and profile install
- [x] README/docs explain generation and Thunderbird installation

## Log
- 2026-11-04 15:43Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 15:43Z status -> done: generator implemented; 5 unit tests pass; CLI/profile smoke run successful
