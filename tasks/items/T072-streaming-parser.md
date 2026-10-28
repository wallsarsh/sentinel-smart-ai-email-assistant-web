---
id: T072
title: "Streaming parser"
phase: P4
status: todo
owner: ""
type: code
size: M
deps: [T070]
paths: [server/ai/sse-parser.ts]
refs: [MOBILE-ADD §5]
reqs: [FR-AI-03]
updated: 2026-10-28
---

# T072 — Streaming parser

## Goal
Server-side SSE parser (byte-chunk safe, UTF-8 splits) feeding the client over our SSE channel.

## Acceptance
- [ ] Split-chunk tests
- [ ] Cancellation closes the upstream request
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
