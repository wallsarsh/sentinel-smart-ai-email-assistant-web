---
id: T156
title: "Production image and deployment"
phase: P9
status: todo
owner: ""
type: config
size: M
deps: [T002, T011]
paths: [Dockerfile, deploy/]
refs: [WEB §9]
reqs: [NFR-MNT-03]
updated: 2026-10-28
---

# T156 — Production image and deployment

## Goal
Multi-stage Docker image (app + worker commands), compose/Helm manifests, migrations on deploy, health checks, resource limits, non-root.

## Acceptance
- [ ] Image builds in CI and runs migrations
- [ ] Rolling update documented
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
