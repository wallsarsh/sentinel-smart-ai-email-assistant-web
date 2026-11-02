---
id: T172
title: "Thunderbird design-system and accessibility polish"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: M
deps: [T169, T170, T171]
paths: [thunderbird/src/theme.css, thunderbird/src/ui.js, thunderbird/src/*.html, tests/unit/thunderbird-assistant.test.ts]
refs: [WEB §6, MOBILE-TEST §7, MOBILE-BRD §7.5]
reqs: [NFR-UX-01, NFR-UX-02, NFR-UX-04]
updated: 2026-11-02
---

# T172 — Thunderbird design-system and accessibility polish

## Goal
Apply one restrained visual system and WCAG-minded behaviour across every extension page.

## Acceptance
- [x] Light/dark tokens, 8px spacing, system font, single accent, priority text+colour, visible focus
- [x] Tabs, dialogs/status regions and form controls have labels and keyboard behaviour
- [x] 320 px reflow, 200% text, reduced motion and forced-colours basics documented/checked
- [x] No raw untrusted HTML; hostile strings render as text in DOM tests
- [x] Static test asserts every HTML page links the shared stylesheet

## Log
- 2026-11-02 12:30Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-02 12:30Z status -> done: implemented and covered by the Thunderbird Vitest suites; real-client validation remains T174
