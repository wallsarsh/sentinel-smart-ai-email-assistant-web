---
id: T107
title: "GraphMailSender"
phase: P6
status: done
owner: "claude"
type: code
size: M
deps: [T105, T048]
paths: [server/mail/send/graph.ts]
refs: [MOBILE-ADD §9.4]
reqs: [FR-SND-02]
updated: 2026-10-28
---

# T107 — GraphMailSender

## Goal
PATCH draft then /send; never retries automatically.

## Acceptance
- [x] Recording-network tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:51Z claimed by claude
- 2026-10-28 15:56Z GraphMailSender: GET draft (Message-ID, quoted original) -> PATCH approved content -> single POST send; 4xx failed, 5xx/dropped unknown, refused failed, no retry, single-use proof; reconcile by internetMessageId in Sent Items; recording-network tests
- 2026-10-28 15:56Z status -> done
