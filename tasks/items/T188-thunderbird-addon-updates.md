---
id: T188
title: "Thunderbird in-add-on repository updates"
phase: P10
status: review
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T173]
paths: [thunderbird/experiments/sentinel-updates/, thunderbird/src/options.js, thunderbird/src/background.js, thunderbird/manifest.json, installer/package-xpi.mjs, .github/workflows/thunderbird-release.yml, tests/unit/thunderbird-updates.test.ts]
refs: [thunderbird/docs/reliability-ux-and-updates.md]
reqs: [TB-UI-01, TB-SEC-04]
updated: 2026-11-18
---

# T188 — Thunderbird in-add-on repository updates

## Goal
Let the installed add-on check and apply compatible releases from the repository branch it was installed from, without leaving Thunderbird.

## Acceptance
- [x] A `sentinelUpdates` experiment reads the packaged `update_url`, asks Thunderbird's add-on manager to check, and installs only packages from the same repository
- [x] Temporary, policy-managed, unknown-source and incompatible installs report an actionable reason
- [x] Failures cross the experiment boundary as `{ ok: false, error }` results, never as thrown errors (which Thunderbird replaces with "An unexpected error occurred")
- [x] Download/parse/security/timeout statuses map to readable messages; a missing release feed says so
- [x] Settings shows the installed version, repository/branch, a releases link, and check/apply with pending state
- [x] Apply refuses an open compose window or running job, verifies the package identity/version, and flags added permissions
- [x] The release workflow publishes the XPI before advertising it in the branch feed

## Log
- 2026-11-18 claimed by opencode-deepseek-v4.1-flash
- 2026-11-18 update-check showed "An unexpected error occurred": the experiment threw across the compartment boundary; entry points now return structured results, feed/status errors are readable, and the panel links to repository releases. Real release publication remains manual.
