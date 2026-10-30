# @sentinel/core

Code that every Sentinel client shares: the web server and worker, the desktop app and the Thunderbird extension.
It has no Node-only or server-only imports (a test enforces this), so it also runs in a browser extension.

| Area          | What                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prompts/`    | `PromptBuilder` (the only place mail content enters a request), HTML-to-text, quote/signature/noise stripping, reviewed prompt texts and schemas |
| `ai/`         | provider adapters (OpenAI-compatible, Anthropic), `fetchHttp`, structured output with one repair turn, JSON-schema checker                       |
| `redactor.ts` | card, IBAN, phone and address redaction                                                                                                          |
| `errors/`     | `Result` and the typed failure kinds                                                                                                             |

Environment seams, set by the host:

- `setHtmlParser(fn)`: Node has no `DOMParser`; the server registers jsdom (`server/ai/prompts/text.ts`). Browsers use their own.
- `setSchemaChecker(fn)`: the server registers Ajv. The built-in checker covers the subset our schemas use and needs no `eval`, which extension content-security policies forbid.
- `AiHttp`: the server passes its SSRF-guarded transport; extensions use `fetchHttp()`.

The old paths (`server/ai/...`, `shared/redactor.ts`, `shared/errors/...`) re-export from here.
