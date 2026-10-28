---
id: T107
title: "GraphMailSender"
phase: P6
status: todo
owner: ""
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
- [ ] Recording-network tests
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
