---
id: T006
title: "Logging with scrubbing"
phase: P0
status: todo
owner: ""
type: code
size: S
deps: [T004]
paths: [server/utils/logger.ts, shared/scrub.ts]
refs: [WEB §8, MOBILE-ADD §7.4]
reqs: [NFR-SEC-09]
updated: 2026-10-28
---

# T006 — Logging with scrubbing

## Goal
Structured logger (pino) with a scrubber for emails, tokens, JWTs, long base64; request-id correlation.

## Acceptance
- [ ] Scrubber unit tests incl. API keys and Bearer tokens
- [ ] No mail content fields can be logged (type-level allow-list)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
