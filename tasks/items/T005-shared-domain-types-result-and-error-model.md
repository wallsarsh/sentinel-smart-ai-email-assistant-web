---
id: T005
title: "Shared domain types, Result and error model"
phase: P0
status: todo
owner: ""
type: code
size: M
deps: [T001]
paths: [shared/domain/, shared/errors/]
refs: [WEB §4, MOBILE-ADD §4.1]
reqs: [NFR-MNT-01]
updated: 2026-10-28
---

# T005 — Shared domain types, Result and error model

## Goal
Entities (MailAccount, MailMessage, Draft, Triage result, Brief...) as zod schemas + inferred types; `Result<T,E>`; `AppFailure` hierarchy matching the mobile app.

## Acceptance
- [ ] Schemas shared by server and client
- [ ] Failure kinds cover network, auth, provider, AI output, consent, cap, storage, validation
- [ ] Round-trip tests
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
