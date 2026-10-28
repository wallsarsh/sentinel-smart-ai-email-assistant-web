---
id: T104
title: "Open draft in the provider web mail"
phase: P6
status: done
owner: "claude"
type: code
size: S
deps: [T103]
paths: [app/utils/native-link.ts]
refs: [MOBILE-ADD §4]
reqs: [FR-DRF-05]
updated: 2026-10-28
---

# T104 — Open draft in the provider web mail

## Goal
Deep links to Gmail/Outlook web drafts; manual instruction for IMAP.

## Acceptance
- [x] https-only links (test)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 15:33Z claimed by claude
- 2026-10-28 15:37Z Native draft links: Gmail/Outlook https deep links (encoded id; host allow-list test over hostile ids), IMAP manual instruction; composer Save as draft with open-in-mail link; draft state endpoint
- 2026-10-28 15:37Z status -> done
