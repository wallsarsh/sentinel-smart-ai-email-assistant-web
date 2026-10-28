---
id: T040
title: "MailProvider port and entities"
phase: P2
status: todo
owner: ""
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
- [ ] Contract test suite reusable by every provider
- [ ] Interface has no send capability (type test)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
