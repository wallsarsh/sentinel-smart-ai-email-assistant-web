---
id: T174
title: "Thunderbird real-client validation matrix"
phase: P10
status: todo
owner: ""
type: manual
size: M
deps: [T173]
paths: []
refs: [MOBILE-TEST §4, MOBILE-TEST §5, MOBILE-TEST §7, thunderbird/docs/manual-validation.md]
reqs: [NFR-MNT-03, NFR-UX-01]
updated: 2026-11-02
---

# T174 — Thunderbird real-client validation matrix

## Goal
Prove the extension on a real Thunderbird install, real accounts and a real provider before calling it done.

## Acceptance
- [ ] Thunderbird 140+ loads the unpacked add-on with no console errors
- [ ] IMAP and at least one OAuth account sync, analyse, tag and brief correctly
- [ ] Auto-draft appears threaded in the account Drafts folder and on a second device; no duplicate for a replied thread
- [ ] Sender rules demonstrably skip/mark/prioritise mail and reduce provider calls
- [ ] Calendar `.ics` opens correctly in Thunderbird and one external calendar
- [ ] Alarms survive sleep/wake; manual refresh works; 200% zoom, dark mode and keyboard-only pass
- [ ] No send action exists in the add-on permissions or UI; results logged here

## Log
