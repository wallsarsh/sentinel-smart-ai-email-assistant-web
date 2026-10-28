---
id: T080
title: "Prompt registry and builder"
phase: P4
status: done
owner: "claude"
type: code
size: M
deps: [T030, T005]
paths: [server/ai/prompts/]
refs: [PROMPTS, MOBILE-ADD §5]
reqs: [NFR-SEC-07]
updated: 2026-10-28
---

# T080 — Prompt registry and builder

## Goal
Port of the mobile prompt texts, schemas and PromptBuilder (boundary tags, defanging, invisible-char stripping, redaction, caps, subject-only mode).

## Acceptance
- [x] Injection fixtures pass
- [x] Prompt versions exported for logging
- [x] Parity tests with mobile fixtures
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 14:09Z claimed by claude
- 2026-10-28 14:13Z Prompt registry + PromptBuilder ported from mobile: texts generated from the reviewed doc (npm run prompts:sync, drift test), versions exported, strict-schema-subset test, builder (boundary tags, defanging, invisible/bidi stripping, redaction, caps, subject-only), htmlToText/stripQuotedText, DST-correct zone offsets; golden file shared with mobile + injection tests
- 2026-10-28 14:13Z status -> done
