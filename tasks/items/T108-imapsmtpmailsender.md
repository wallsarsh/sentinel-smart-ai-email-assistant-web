---
id: T108
title: "ImapSmtpMailSender"
phase: P6
status: done
owner: "claude"
type: code
size: L
deps: [T105, T051, T052]
paths: [server/mail/send/smtp.ts]
refs: [MOBILE-ADD §9.4]
reqs: [FR-SND-02]
updated: 2026-10-28
---

# T108 — ImapSmtpMailSender

## Goal
SMTP submission with the approved content, APPEND to Sent unless the server saves it, delete draft; 4xx failed, 5xx/timeout unknown.

## Acceptance
- [x] Fake SMTP server tests for each outcome
- [x] Never retries
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:57Z claimed by claude
- 2026-10-28 16:04Z ImapSmtpMailSender: draft located for its References, single SMTP submission via nodemailer, files copy in Sent unless server does, deletes draft (housekeeping errors ignored); classification: server reply or pre-DATA error = failed, silence after DATA = unknown (watched without logging credentials); never retries; reconcile via Sent search; fake SMTP server tests for every outcome
- 2026-10-28 16:04Z status -> done
