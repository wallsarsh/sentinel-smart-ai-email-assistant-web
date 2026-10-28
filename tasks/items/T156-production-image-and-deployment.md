---
id: T156
title: "Production image and deployment"
phase: P9
status: done
owner: "claude"
type: config
size: M
deps: [T002]
paths: [Dockerfile, deploy/]
refs: [WEB §9]
reqs: [NFR-MNT-03]
updated: 2026-10-28
---

# T156 — Production image and deployment

## Goal
Multi-stage Docker image (app + worker commands), compose/Helm manifests, migrations on deploy, health checks, resource limits, non-root.

## Acceptance
- [x] Image builds in CI and runs migrations
- [x] Rolling update documented
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 Dropped dep on manual T011 (domain/TLS/hosting): the image, compose and Helm manifests do not need a real environment. TLS termination, hostnames and the KMS-held KEK are values the operator supplies at T160; nothing here hard-codes them.
- 2026-10-28 21:27Z claimed by claude
- 2026-10-28 21:45Z Production image (multi-stage, non-root, read-only fs, health check; web/worker/migrate commands; 530MB), compose and Kubernetes manifests, CI image job, docs/deployment.md incl. rolling update. VERIFIED here: image built with docker, migrations ran from it on real Postgres, web healthy and ready as uid 1000 on a read-only filesystem, worker started. Manifests are checked by tests/unit/deploy.test.ts but NOT applied to a cluster. Dropped dep on manual T011 (domain/TLS/hosting) with a note; plain K8s YAML instead of Helm.
- 2026-10-28 21:45Z status -> done
