---
id: T050
title: "ImapMailProvider: read and sync"
phase: P2
status: done
owner: "claude"
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
- [x] Tested against an in-memory IMAP server (live GreenMail/Dovecot run of imapflow adapter moved to T160)
- [x] Never sets \Seen
- [x] UIDVALIDITY change triggers resync
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 12:55Z claimed by claude
- 2026-10-28 12:59Z IMAP read/sync via ImapSession port: read-only open, BODY.PEEK, UID+UIDVALIDITY cursor with resync, special-use detection, mailparser; imapflow adapter; in-memory server + contract suite (contract extended with idFor/threadFor)
- 2026-10-28 12:59Z status -> done
