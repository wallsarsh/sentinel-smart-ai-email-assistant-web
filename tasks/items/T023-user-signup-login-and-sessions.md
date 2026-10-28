---
id: T023
title: "User signup, login and sessions"
phase: P1
status: done
owner: "claude-sonnet-5-5"
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
- [x] Password policy and breach-check optional hook
- [x] Session fixation prevented
- [x] Integration tests
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:34Z claimed by claude-sonnet-5-5
- 2026-10-28 10:35Z Signup/login/logout/me/password-reset API; argon2id (OWASP params), policy, hashed random session tokens (idle 14d, absolute 30d, rotation), uniform login errors with timing dummy, reset tokens single-use 1h revoking sessions, system mailer (SMTP, fixed sender) in the send module, DI root. Account lockout is T026
- 2026-10-28 10:35Z status -> done
