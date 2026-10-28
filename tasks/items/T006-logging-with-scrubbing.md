---
id: T006
title: "Logging with scrubbing"
phase: P0
status: done
owner: "claude-sonnet-5-5"
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
- [x] Scrubber unit tests incl. API keys and Bearer tokens
- [x] No mail content fields can be logged (type-level allow-list)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:26Z claimed by claude-sonnet-5-5
- 2026-10-28 10:26Z pino logger with type-level allow-listed fields + runtime drop, scrubber (emails, keys, JWT, bearer, blobs, password=), request-id middleware
- 2026-10-28 10:26Z status -> done
