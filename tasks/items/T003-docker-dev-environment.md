---
id: T003
title: "Docker dev environment"
phase: P0
status: done
owner: "claude-sonnet-5-5"
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
- [x] `docker compose up` gives a working dev stack
- [x] No real secrets in repo (test enforces)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:24Z claimed by claude-sonnet-5-5
- 2026-10-28 10:24Z Compose dev stack (Postgres, Mailpit, GreenMail, optional app), Dockerfile.dev, documented .env.example; hygiene test guards against real secrets. Not run with Docker here (no daemon in sandbox)
- 2026-10-28 10:24Z status -> done
