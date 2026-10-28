---
id: T041
title: "MIME reply builder"
phase: P2
status: done
owner: "claude-sonnet-5-5"
type: code
size: M
deps: [T005]
paths: [server/mail/mime/]
refs: [MOBILE-ADD §4.2]
reqs: [FR-DRF-03]
updated: 2026-10-28
---

# T041 — MIME reply builder

## Goal
Threading headers, reply vs reply-all recipients, subject handling, RFC 2047, deterministic Message-ID.

## Acceptance
- [x] Fixture tests ported from mobile
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:55Z claimed by claude-sonnet-5-5
- 2026-10-28 10:56Z MIME reply builder: subject/recipients/references/message ids, RFC 2047 words, folded headers, QP UTF-8 body, header-injection safe, deterministic; parse-back tests with mailparser
- 2026-10-28 10:56Z status -> done
