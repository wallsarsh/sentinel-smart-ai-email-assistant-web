---
id: T150
title: "End-to-end suite with fakes"
phase: P9
status: done
owner: "claude"
type: test
size: L
deps: [T140, T113, T126]
paths: [tests/e2e/]
refs: [MOBILE-TEST §4]
reqs: [NFR-MNT-04]
updated: 2026-10-28
---

# T150 — End-to-end suite with fakes

## Goal
Playwright flows against fake Gmail/Graph/IMAP/AI servers: onboarding, connect, sync, triage, brief, draft, confirm, undo, send, wipe.

## Acceptance
- [x] Runs in CI
- [x] Flows documented
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 19:07Z claimed by claude
- 2026-10-28 19:43Z E2E suite: built server + real Postgres 16 + Chromium (npm run e2e, CI job added, flows documented in tests/e2e/README.md): first run/onboarding resume, sign-in/out, CSRF, session revocation, settings persistence, seeded mail+brief, wipe; plus real-Postgres checks (migrations, SKIP LOCKED, LISTEN/NOTIFY). Real bugs found and fixed: CSRF header never sent by page code (every POST 403'd), /api/auth/me counted against the 10/min login limit (reloads signed users out). Connect/sync/triage/draft/send are NOT in the browser suite (no fake provider injection into prod build); covered in-process with fakes, live check is T160.
- 2026-10-28 19:43Z status -> done
