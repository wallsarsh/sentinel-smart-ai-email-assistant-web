# Add-on review: ThunderAI and AI Mail Support

Reviewed on 2026-11-04 for product direction, not for code reuse. Both projects are separate works (ThunderAI: GPLv3; AI Mail Support: MIT); Sentinel adopts interaction patterns and ideas only, not source code.

- ThunderAI `5.1.2`, reviewed `README.md`, `manifest.json`, `js/mzta-compose-script.js`, `js/mzta-menus.js`, `js/mzta-prompts.js`, `js/mzta-summarystore.js`.
- AI Mail Support `1.0.5`, reviewed `README.md`, `src/manifest.json`, `src/ts/background.ts`, `src/ts/promptDisplay.ts`, `src/ts/outputDisplay.ts`.

## What they do well

### ThunderAI

- `message_display_action` and `compose_action` share one prompt UI, so the same assistant works while reading and while composing.
- Context menus expose **Reply**, **Proofread**, **Rewrite**, **Summarize**, **Translate**, **Add tags**, **Classify**, **Calendar event**, **Task** and **Prompt this**.
- Custom prompts with placeholders, per-prompt provider/model settings, menu ordering, batch processing, an AI chat window and per-answer token usage.
- Automatic features: auto-tagging, spam filter, auto-summarize, auto-translate, with sender/domain skip and block lists and a summary cache.
- Compose integration is rich: it preserves the quote/signature, supports plain text and HTML, inserts into the editor as one undo step, and avoids injecting its own UI into prompt text.
- Enterprise policies and many translations.

### AI Mail Support

- `compose_action` and `message_display_action` use menu-type actions with contexts for `compose_action_menu`, `message_display_action_menu` and `selection`.
- Compose menu: **Analyze intent**, **Explain**, **Summarize**, and a **Suggest reply** submenu with Standard, Fluid, Creative, Simple, Formal, Academic, Expanded, Shortened and Polite tones.
- Selection menu: **Rephrase** with the same tone family, plus text-to-speech and summarization.
- A dedicated response panel in a shadow DOM: streaming Markdown, stop, copy/insert, custom prompt input and error/thinking states.
- PII masking before provider calls, multiple native provider integrations, model discovery and localization.
- Minimal manifest: `accountsRead`, `compose`, `menus`, `messagesRead`, `messagesModify`, `sensitiveDataUpload`, `storage` plus provider hosts.

## Adoption decisions

| Capability | ThunderAI | AI Mail Support | Sentinel decision |
|---|---|---|---|
| Reply compose action | Shared prompt popup | Menu with reply tones | **Adopted and extended** in T177: compose action popup with original-message analysis, 9 tones, intent, length, editable preview, insert/copy |
| Intent analysis | Classify / prompt actions | Analyze intent | **Already present** in monitor analysis; now surfaced in the reply view |
| Summarize | Context action + auto summary cache | Context action | **Already present** as triage summaries and daily brief |
| Tone presets | Custom prompts | 9 reply/rephrase tones | **Adopted** as Standard, Professional, Friendly, Concise, Formal, Creative, Casual, Apologetic, Persuasive |
| Editable output before insertion | Chat/prompt UI | Shadow-DOM output panel with insert/copy | **Adopted** as preview + insert/copy in T177 |
| Streaming response | Chat window | Streaming output panel | **Deferred**: current draft call is non-streaming; add after the compose flow stabilises |
| Proofread / rewrite selection | Diff picker | Rephrase selection | **Deferred**: needs compose/display content scripts and a diff UI |
| Translate | Context action + auto translate | Context action | **Deferred**; not central to Sentinel's triage/draft thesis |
| Custom prompts / placeholders | Full manager | Custom prompt field | **Partially adopted** as the optional instruction field; full manager deferred |
| Per-feature provider/model | Yes | Yes | **Deferred**: Sentinel currently has one provider; core supports Anthropic/OpenAI adapters |
| Auto-tagging | Yes | No | **Already present** via best-effort Sentinel tags |
| Spam filter | Yes | No | **Out of scope** for this phase; Sentinel is not a spam classifier |
| Chat window | Yes | No | **Deferred**; the dashboard/brief is the product surface |
| Batch processing | Yes | No | **Deferred**; monitor batches are cost-limited and automatic |
| Calendar event / task | Yes (with Sparks) | No | **Partially present** via calendar candidates and `.ics`; direct calendar API remains experimental |
| PII masking | Prompt review | js-pii-mask | **Already present** through the shared redactor in `PromptBuilder` |
| Provider breadth | Many native providers | Many native providers | **Partial**: OpenAI-compatible endpoint plus core Anthropic/OpenAI adapters; native provider presets deferred |
| Context menus / selection actions | Yes | Yes | **Deferred**; compose action and message popup cover the first release |
| Enterprise managed config | Yes | No | **Deferred**; not needed for the current Add-ons path |
| Localization | Many languages | English/Italian | **Deferred**; extension copy is English for now |
| Brief update visibility | No tray/badge pattern found | No tray/badge pattern found | **Added by Sentinel** in T176: brief toolbar badge + native count-only notification |

## Deliberate boundaries

- Sentinel keeps its hard rule: no send permission, no send code path, no auto-reply. Every reply is inserted into a compose window or saved as a draft and reviewed by a human.
- No third-party chat web UI is embedded; the extension calls the configured OpenAI-compatible endpoint.
- No spam classification, message mutation, translation or selection rewriting in this phase.
- Calendar writes remain explicit `.ics` exports until Thunderbird's calendar WebExtension API stabilises.

## Follow-ups if product direction needs them

1. Streaming draft output in the compose preview (parity with AI Mail Support).
2. Selection-based rewrite/proofread with an accept/reject diff (ThunderAI-style).
3. A compact context menu for the message list and compose window.
4. Custom prompt library with placeholders and per-prompt provider routing.
5. Native provider adapters/presets if the single OpenAI-compatible route is not enough.
