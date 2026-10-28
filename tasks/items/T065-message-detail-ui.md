---
id: T065
title: "Message detail UI"
phase: P3
status: todo
owner: ""
type: code
size: L
deps: [T062, T027, T028]
paths: [app/pages/inbox/[id].vue, app/components/message/]
refs: [MOBILE-ADD §10.2]
reqs: [FR-READ-06]
updated: 2026-10-28
---

# T065 — Message detail UI

## Goal
Thread view, sandboxed sanitized HTML (iframe sandbox + CSP), load-images opt-in, link guard dialog, attachments list (metadata only), AI card slot.

## Acceptance
- [ ] XSS corpus renders inert in the browser test
- [ ] Images blocked by default
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
