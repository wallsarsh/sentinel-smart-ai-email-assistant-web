---
id: T023
title: "User signup, login and sessions"
phase: P1
status: todo
owner: ""
type: code
size: M
deps: [T021, T004]
paths: [server/auth/, server/api/auth/]
refs: [WEB §8]
reqs: [NFR-SEC-05]
updated: 2026-10-28
---

# T023 — User signup, login and sessions

## Goal
Email + password (argon2id), secure httpOnly SameSite cookies, session rotation, logout, password reset by email token.

## Acceptance
- [ ] Password policy and breach-check optional hook
- [ ] Session fixation prevented
- [ ] Integration tests
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
