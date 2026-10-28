---
id: T072
title: "Streaming parser"
phase: P4
status: done
owner: "claude"
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
- [x] Split-chunk tests
- [x] Cancellation closes the upstream request
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:51Z claimed by claude
- 2026-10-28 13:54Z SSE parser (chunk/UTF-8/CRLF safe) and streaming for Anthropic and OpenAI adapters; deltas then done with usage; typed AiStreamError; early stop closes the upstream request
- 2026-10-28 13:54Z status -> done
