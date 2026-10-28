---
id: T050
title: "ImapMailProvider: read and sync"
phase: P2
status: todo
owner: ""
type: code
size: L
deps: [T040, T049, T022]
paths: [server/mail/imap/]
refs: [MOBILE-ADD §4.5]
reqs: [FR-READ-03]
updated: 2026-10-28
---

# T050 — ImapMailProvider: read and sync

## Goal
imapflow client pool per account, EXAMINE + BODY.PEEK, UID cursor with UIDVALIDITY, special-use folder detection, MIME parsing (mailparser).

## Acceptance
- [ ] Tested against a GreenMail/Dovecot container
- [ ] Never sets \Seen
- [ ] UIDVALIDITY change triggers resync
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
