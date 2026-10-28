---
id: T101
title: "Draft generator with streaming"
phase: P6
status: done
owner: "claude"
type: code
size: L
deps: [T080, T075, T072, T034, T100]
paths: [server/drafts/generator.ts, server/api/drafts/generate.post.ts]
refs: [MOBILE-ADD §5.3]
reqs: [FR-DRF-02]
updated: 2026-10-28
---

# T101 — Draft generator with streaming

## Goal
Streams plain-text reply drafts for tone/intent/instruction from the thread; cancel support; text cleaning (no subject, fences, signature).

## Acceptance
- [x] Streaming cancel test
- [x] Foreign-detail scan helper (links, emails, phones not in thread)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:16Z claimed by claude
- 2026-10-28 15:21Z Draft generator: streams from the thread via gateway (consent/caps/usage), fallback chain only before first delta, cancel closes upstream, excluded accounts refused, text cleaning (fences, subject, signature), foreign link/email/phone scan + placeholders; SSE endpoint
- 2026-10-28 15:21Z status -> done
