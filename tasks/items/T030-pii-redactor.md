---
id: T030
title: "PII redactor"
phase: P1
status: done
owner: "claude-sonnet-5-5"
type: code
size: S
deps: [T005]
paths: [shared/redactor.ts]
refs: [MOBILE-ADD §5, MOBILE-BRD FR-SET-03]
reqs: [NFR-PRV-01]
updated: 2026-10-28
---

# T030 — PII redactor

## Goal
Card (Luhn), IBAN (mod 97), phone and other-email redaction with keep-list; options per user.

## Acceptance
- [x] Fixture parity with mobile tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:44Z claimed by claude-sonnet-5-5
- 2026-10-28 10:44Z Redactor port (Luhn cards, mod-97 IBANs, phones with date/decimal exclusions, other emails with keep-list, per-kind switches); fixtures mirror mobile
- 2026-10-28 10:44Z status -> done
