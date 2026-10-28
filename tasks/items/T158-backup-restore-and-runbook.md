---
id: T158
title: "Backup, restore and runbook"
phase: P9
status: done
owner: "claude"
type: docs
size: S
deps: [T156]
paths: [docs/runbook.md]
refs: [WEB §9]
reqs: [NFR-REL-01]
updated: 2026-10-28
---

# T158 — Backup, restore and runbook

## Goal
Postgres backup/restore (tested), KEK rotation procedure, incident checklist, on-call basics.

## Acceptance
- [x] Restore drill recorded in the log
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 Restore drill (tests/ops/restore-drill.e2e.ts, Postgres 16, 20,000 messages): backup 0.3 s, restore 1.2 s, all tables identical, secret readable with same KEK and unreadable with another, KEK rotation 1.5 s. Found and fixed: two backups in the same second overwrote each other; KEK rotation had no way to supply older keys (added KEK_VERSION/KEK_PREVIOUS and a rotate command).
- 2026-10-28 21:55Z claimed by claude
- 2026-10-28 22:15Z Backup/restore scripts (verified dump, checksum, retention, restore guarded by CONFIRM_RESTORE), KEK rotation (KEK_VERSION/KEK_PREVIOUS config, rotate command in the image), runbook with incident checklist; restore drill run for real on Postgres 16 and automated (backup 0.3s, restore 1.2s for 20k messages, identical tables, secret readable). Not tested: managed-Postgres PITR, the drill at production data volumes.
- 2026-10-28 22:15Z status -> done
