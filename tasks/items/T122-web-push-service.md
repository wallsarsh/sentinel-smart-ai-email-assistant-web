---
id: T122
title: "Web push service"
phase: P7
status: done
owner: "claude"
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
- [x] Payload contains ids only (test)
- [x] Actions limited to Open and Mark done (no reply/send)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 17:08Z claimed by claude
- 2026-10-28 17:16Z Web push: VAPID transport via web-push (503 when unconfigured), subscriptions per endpoint (https only, keys never listed), strict ids-only payload schema (text rejected), 404/410 removal and failure marking/cleanup, service worker (fixed titles, tag per message, Open/Mark done only, no send/reply path, Mark done via the page's CSRF), permission UX that only prompts from a click, devices/test endpoints
- 2026-10-28 17:16Z status -> done
