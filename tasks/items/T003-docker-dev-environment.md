---
id: T003
title: "Docker dev environment"
phase: P0
status: todo
owner: ""
type: config
size: S
deps: [T001]
paths: [docker-compose.dev.yml, Dockerfile.dev, .env.example]
refs: [WEB §9]
reqs: [NFR-MNT-03]
updated: 2026-10-28
---

# T003 — Docker dev environment

## Goal
Compose file with Postgres, a local mail test server (GreenMail or Mailpit) and the app; `.env.example` with every variable documented.

## Acceptance
- [ ] `docker compose up` gives a working dev stack
- [ ] No real secrets in repo (test enforces)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
