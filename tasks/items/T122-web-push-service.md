---
id: T122
title: "Web push service"
phase: P7
status: todo
owner: ""
type: code
size: L
deps: [T033, T008]
paths: [server/push/, app/sw/]
refs: [WEB §7]
reqs: [FR-BG-03]
updated: 2026-10-28
---

# T122 — Web push service

## Goal
VAPID keys, service worker, subscription storage per device, send with payload = local id only, expired-subscription cleanup, permission UX.

## Acceptance
- [ ] Payload contains ids only (test)
- [ ] Actions limited to Open and Mark done (no reply/send)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
