---
id: T012
title: "Send-gate architecture check (JS)"
phase: P0
status: done
owner: "claude-sonnet-5-5"
type: code
size: S
deps: [T001]
paths: [tools/send-gate-check.mjs]
refs: [WEB §7, MOBILE-ADD §9.4]
reqs: [NFR-SEC-10]
updated: 2026-10-28
---

# T012 — Send-gate architecture check (JS)

## Goal
Script that fails CI if send primitives (SMTP send, Gmail drafts.send/messages.send, Graph sendMail/send) appear outside `server/mail/send/`, or if that module is imported outside the confirmation API route and DI root, or from AI/jobs/triage/brief/notification code.

## Acceptance
- [x] Fixtures with violations make it fail
- [x] Wired into `npm run check` and CI
- [x] Allow-list file requires security approval
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:27Z claimed by claude-sonnet-5-5
- 2026-10-28 10:27Z tools/send-gate-check.mjs (primitives only in server/mail/send, importers limited to server/api/send + server/container.ts, no send types in ai/jobs/worker/triage/brief/sync/push), allowlist file, wired into npm run check and CI; fixture tests
- 2026-10-28 10:27Z status -> done
