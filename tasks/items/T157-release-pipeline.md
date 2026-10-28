---
id: T157
title: "Release pipeline"
phase: P9
status: done
owner: "claude"
type: config
size: S
deps: [T156]
paths: [.github/workflows/release.yml]
refs: [WEB §9]
reqs: [NFR-MNT-03]
updated: 2026-10-28
---

# T157 — Release pipeline

## Goal
Tagged builds: checks, image push, staging deploy, manual promotion to prod, source maps stored privately.

## Acceptance
- [x] Rollback documented
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 21:45Z claimed by claude
- 2026-10-28 21:55Z Release pipeline: tag-triggered workflow (full CI → image push to GHCR with version tag → private source-map artifact → staging deploy + smoke → production behind environment approval, skipped for -rc), deploy/deploy.sh (migrate → web → worker, stops on failed migration, refuses :latest) tested against a fake kubectl, rollback workflow + docs/release.md. Source maps verified out of the built image via docker. NOT run: the workflows themselves on GitHub (needs tags, environments, kubeconfig secrets).
- 2026-10-28 21:55Z status -> done
