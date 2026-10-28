---
id: T040
title: "MailProvider port and entities"
phase: P2
status: done
owner: "claude-sonnet-5-5"
type: code
size: M
deps: [T005]
paths: [server/mail/provider.ts]
refs: [MOBILE-ADD §4.1]
reqs: [FR-ACC-04]
updated: 2026-10-28
---

# T040 — MailProvider port and entities

## Goal
Provider-neutral interface (listFolders, fetchChanges, getMessages, getThread, createReplyDraft, updateDraft, deleteDraft, nativeLink) — no send method.

## Acceptance
- [x] Contract test suite reusable by every provider
- [x] Interface has no send capability (type test)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:53Z claimed by claude-sonnet-5-5
- 2026-10-28 10:54Z MailProvider port (no send method; type-level and by-name test), ReplyDraft/DraftRef, reusable contract suite (runMailProviderContract: no send, folders, incremental sync, get by id/thread, idempotent drafts, update/delete, https link, network failure as value, close) run against an in-memory reference provider
- 2026-10-28 10:54Z status -> done
