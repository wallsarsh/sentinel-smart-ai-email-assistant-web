---
id: T178
title: "Thunderbird add-on review and feature adoption notes"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: docs
size: S
deps: [T176, T177]
paths: [thunderbird/docs/addon-review.md, thunderbird/docs/requirements.md, thunderbird/docs/implementation-plan.md, thunderbird/README.md]
refs: [ThunderAI README/source, AI Mail Support README/source]
reqs: [FR-TRI-01, FR-DRF-01, FR-SUM-03, FR-SET-03]
updated: 2026-11-04
---

# T178 — Thunderbird add-on review and feature adoption notes

## Goal
Record what was reviewed in ThunderAI and AI Mail Support, which capabilities are relevant, what Sentinel adopted, and what is deliberately deferred.

## Acceptance
- [x] Review lists the observed surface, compose/reply actions, automation, customization and permissions of both add-ons
- [x] Adoption table marks implemented, already present, deferred or out of scope with a reason
- [x] Requirements and implementation plan reflect the adopted compose assistant and brief notification
- [x] README links the review

## Log
- 2026-11-04 15:10Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 15:10Z status -> done: implemented and covered by Thunderbird tests; manual real-client validation remains T174
