---
id: T108
title: "ImapSmtpMailSender"
phase: P6
status: todo
owner: ""
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
- [ ] Fake SMTP server tests for each outcome
- [ ] Never retries
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
