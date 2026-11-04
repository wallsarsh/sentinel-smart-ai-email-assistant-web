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
| Streaming response | Chat window | Streaming output panel | **Adopted** in T180: draft tokens stream into the editable compose preview |
| Proofread / rewrite selection | Diff picker | Rephrase selection | **Adopted** in T179: compose content script reads the selection and a word-level accept/reject diff applies it |
| Translate | Context action + auto translate | Context action | **Deferred**; not central to Sentinel's triage/draft thesis |
| Custom prompts / placeholders | Full manager | Custom prompt field | **Partially adopted** as the optional instruction field; full manager deferred |
| Per-feature provider/model | Yes | Yes | **Adopted** in T182: multiple providers, native OpenAI/Anthropic adapters and triage/brief/draft/proofread/rewrite routes |
| Auto-tagging | Yes | No | **Already present** via best-effort Sentinel tags |
| Spam filter | Yes | No | **Out of scope** for this phase; Sentinel is not a spam classifier |
| Chat window | Yes | No | **Deferred**; the dashboard/brief is the product surface |
| Batch processing | Yes | No | **Adopted** in T181: select inbox rows and run bounded Analyze or Create drafts batches |
| Calendar event / task | Yes (with Sparks) | No | **Adopted** in T183: direct writes through a bundled experimental calendar API, with `.ics` fallback |
| PII masking | Prompt review | js-pii-mask | **Already present** through the shared redactor in `PromptBuilder` |
| Provider breadth | Many native providers | Many native providers | **Adopted** as presets for OpenAI, Anthropic, OpenAI-compatible, Ollama, LM Studio, Groq, Mistral, OpenRouter and Gemini-compatible |
| Context menus / selection actions | Yes | Yes | **Adopted** in T184: message-list/message-display Sentinel submenu; selection tools live in the compose assistant |
| Enterprise managed config | Yes | No | **Deferred**; not needed for the current Add-ons path |
| Localization | Many languages | English/Italian | **Deferred**; extension copy is English for now |
| Brief update visibility | No tray/badge pattern found | No tray/badge pattern found | **Added by Sentinel** in T176: brief toolbar badge + native count-only notification |

## Deliberate boundaries

- Sentinel keeps its hard rule: no send permission, no send code path, no auto-reply. Every reply is inserted into a compose window or saved as a draft and reviewed by a human.
- No third-party chat web UI is embedded; the extension calls the configured OpenAI-compatible endpoint.
- No spam classification, message mutation, translation or chat window in this phase.
- Direct calendar writes use an experimental API and always fall back to an explicit `.ics` export.

## Follow-ups if product direction needs them

1. Custom prompt library with placeholders and per-prompt provider routing.
2. Translate and explain actions in the context menus.
3. Streamed proofread/rewrite output and a side-by-side diff editor.
4. Real Thunderbird validation of the experimental calendar API and compose scripts (T174).
