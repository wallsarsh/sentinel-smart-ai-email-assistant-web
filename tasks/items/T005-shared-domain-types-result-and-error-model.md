---
id: T005
title: "Shared domain types, Result and error model"
phase: P0
status: done
owner: "claude-sonnet-5-5"
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
- [x] Schemas shared by server and client
- [x] Failure kinds cover network, auth, provider, AI output, consent, cap, storage, validation
- [x] Round-trip tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:25Z claimed by claude-sonnet-5-5
- 2026-10-28 10:26Z zod domain schemas (mail, triage, drafts/brief), priority matrix, Result, AppFailure (13 kinds) with HTTP mapping and content-free wire form
- 2026-10-28 10:26Z status -> done
