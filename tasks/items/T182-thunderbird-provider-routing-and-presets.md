---
id: T182
title: "Thunderbird per-task provider routing and native presets"
phase: P10
status: done
owner: "opencode-deepseek-v4.1-flash"
type: code
size: L
deps: [T173]
paths: [thunderbird/src/providers.js, thunderbird/src/config.js, thunderbird/src/ai.js, thunderbird/src/options.js, thunderbird/src/options.html, tests/unit/thunderbird-assistant.test.ts]
refs: [MOBILE-BRD §6.3, MOBILE-ADD §5.6]
reqs: [FR-AI-01, FR-AI-02, FR-AI-03, FR-AI-06]
updated: 2026-11-17
---

# T182 — Thunderbird per-task provider routing and native presets

## Goal
Support multiple providers, native OpenAI/Anthropic adapters, OpenAI-compatible endpoints and a provider/model route per task.

## Acceptance
- [x] Providers have id, name, kind, URL, key and default model; legacy single-provider settings migrate
- [x] Presets cover OpenAI, Anthropic, OpenAI-compatible, Ollama, LM Studio, Groq, Mistral, OpenRouter and Gemini-compatible
- [x] Task routes cover triage, brief, draft, proofread and rewrite
- [x] Provider settings UI adds/edits/removes providers and routes
- [x] Existing tests and the compose/monitor paths use the routing layer
- [x] Provider/config routing is unit tested

## Log
- 2026-11-04 15:29Z claimed by opencode-deepseek-v4.1-flash
- 2026-11-04 15:29Z status -> done: implemented and covered by automated tests/build; real Thunderbird validation remains T174
- 2026-11-17 18:19Z Anthropic from the extension: send anthropic-dangerous-direct-browser-access (required for browser origins), bump anthropic-version to 2026-10-21, detect the CORS 401 that orgs with ZDR/Compliance return so it is not reported as a bad key, and clean quotes/Bearer from pasted keys.
- 2026-11-17 18:27Z Options UI: saving a provider keeps its form open, 'Use default for all features' applies the default model to every route in one click, default changes sync to rows that use it, and Load models asks for host permission directly from the click (no awaited contains() that broke the user-gesture requirement).
