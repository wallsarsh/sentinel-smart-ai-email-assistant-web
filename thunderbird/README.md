# Sentinel AI for Thunderbird

A quiet AI assistant inside Thunderbird. It watches your inboxes, explains what matters, keeps an hourly-updated daily brief, saves reviewable drafts to your own Drafts folder, and turns dated actions into calendar files.

**It never sends, deletes, moves or archives mail.** The add-on does not request send permissions and has no send code path. You review and send every reply yourself, from any device.

## What it does

| Area | Behaviour |
|---|---|
| Monitoring | Checks every inbox on a schedule (default hourly) and shortly after new mail arrives. Only new mail is analysed; results are cached for 14 days. |
| Analysis | Category, **intent**, importance, urgency, P1–P4 priority, needs-reply, summary, reason, action items and calendar candidates. Priority is computed in code. |
| Tags | Best-effort Thunderbird tags: `Sentinel P1…P4`, `Sentinel Reply`, `Sentinel Ignored`. If the tag API is unavailable, analysis still works. |
| Daily brief | One brief for the current local day, refreshed when the monitor finds new mail (hourly at most). A count badge appears on the brief toolbar icon and a content-free native notification announces the update when enabled. You can refresh it at any time. |
| Drafts | For messages that need a reply, at most a few reviewable drafts per run are saved in the account's own Drafts folder, threaded as a reply. Already-replied threads and existing drafts are skipped. |
| Compose assistant | In any reply compose window, the **Sentinel** toolbar button shows the original analysis, a tone picker (Standard…Persuasive), reply intent, length and an optional instruction. Draft text streams into an editable preview, then inserts above the quote; you review and send. Select text and use **Proofread** or **Rewrite** to review word-level changes and accept or reject each one. |
| Sender rules | Mark a sender/domain **Important**, **Marketing** or **Ignore**. Ignore never reaches the AI; Marketing is classified locally unless you opt in; Important is analysed first and raised to high importance. |
| Calendar | Meeting/dated-action candidates can be added as a standards-compliant `.ics` file. Nothing is written to a calendar without your click. |
| Dashboard | Brief, Inbox, Drafts, Senders and Settings in one calm page, with a message popup for the open email. Inbox rows can be selected for bounded **Analyze selected** or **Create drafts** batches. Native message-list and message-display context menus expose the same actions. |

## Install

```sh
npm ci                 # from the repository root
npm run ext:build      # writes thunderbird/dist (committed so you can load it directly)
```

Thunderbird 140+ → **Tools → Developer Tools → Debug Add-ons → Load Temporary Add-on** → pick `thunderbird/manifest.json`.

Then:

1. Open **Provider settings** and add one or more providers: OpenAI, Anthropic, an OpenAI-compatible endpoint, or a preset for Ollama, LM Studio, Groq, Mistral, OpenRouter or Gemini-compatible. Each key stays in this Thunderbird profile.
2. Choose the provider and model for each task (analysis, brief, drafts, proofreading, rewrite) in **Task routing**.
3. Grant the provider origin permission when Thunderbird asks.
4. Open **Dashboard** from the toolbar popup and press **Refresh now** for the first run.

No hosted Sentinel account or server is involved. Mail goes only to the mailbox provider and the AI provider you configured.

## How processing works

```
inbox folders ── headers ── sender rules + bulk/security pre-filter
                                  │                 │
                                  │                 └── local classification (no tokens)
                                  └── PromptBuilder ── provider adapter (OpenAI / Anthropic / compatible)
                                          │
                     analysis cache + tags + brief + draft eligibility
                                          │
                     Drafts folder (threaded, unsent) + .ics exports
```

- Bodies are trimmed, quoted history and signatures are stripped, and attachments are never read.
- At most 8 messages per AI request; batches are sequential. Defaults cap a run at 80 inspected and 40 AI- analysed messages.
- The brief uses stored summaries, never full bodies.
- Auto-drafts are capped at 3 per run and only for P1/P2 (configurable) messages with no existing reply or draft.

## Add-on review

We reviewed [ThunderAI](https://github.com/micz/ThunderAI) and [AI Mail Support](https://github.com/YellowSakura/aimailsupport) for product direction. The adopted and deferred capabilities are documented in [`docs/addon-review.md`](docs/addon-review.md).

## Sender rules

Add rules in **Dashboard → Senders**, or use the one-click buttons in the message popup.

- Exact address: `alex@acme.example`
- Domain: `@acme.example`
- Subdomains: `@*.acme.example`

Exact addresses beat domains. On equal specificity: Ignore > Important > Marketing > Normal. Bulk/list mail (`List-Unsubscribe`, `Precedence: bulk`, `Auto-Submitted`) is treated as Marketing by default.

## Draft replies and the compose assistant

- Auto-drafts are saved through the account identity that received the message, so Thunderbird should place them in that account's configured **Drafts** folder (for IMAP, the server Drafts folder). The dashboard shows the folder name next to each saved draft. If your account's Drafts folder is set to Local Folders in Thunderbird Account Settings, change it to the IMAP Drafts folder there.
- In a reply compose window, click **Sentinel** in the main compose toolbar. Review the original message card, choose a tone, intent and length, optionally add an instruction, then **Generate preview**. Edit the preview and press **Insert into reply**; nothing is sent.
- The compose tone presets are Standard, Professional, Friendly, Concise, Formal, Creative, Casual, Apologetic and Persuasive.

## Daily brief and manual refresh

The brief covers from local midnight to now. A monitor run refreshes it only when new mail was analysed (or at the start of a new day); pressing **Refresh brief** regenerates it on demand. Notifications say only how many new messages are in the brief — never mail text. Thunderbird does not expose a separate system-tray icon API, so Sentinel uses the count badge on its brief toolbar icon plus a native OS notification, and clears the badge when you open the brief or dashboard.

## Calendar export

Sentinel ships a minimal, optional `sentinelCalendar` experiment API. Where Thunderbird loads it, **Add** writes the event directly to a writable calendar. Where it is unavailable or fails before any write, Sentinel falls back to the RFC 5545 `.ics` download; open that with Thunderbird, Google Calendar, Outlook or any standards-compliant calendar. The experiment is not guaranteed to be accepted by an add-on store, so the ICS path remains the safe default.

## Privacy and safety

- No `compose.send` or `messages.send` permission; no send call in the source.
- Ignored senders, marketing mail and security mail never go to the AI by default; security mail is classified locally.
- Analysis and draft records live in `browser.storage.local`; bodies stay in Thunderbird.
- Errors and status contain no subject lines, bodies or addresses.
- Provider URL must be HTTPS (or localhost for a local model server).

## Demo mailbox

For realistic test traffic, generate synthetic threaded mail and install it into Local Folders:

```sh
npm run demo:mail -- --days 5 --apply
```

See [`docs/demo-mail.md`](docs/demo-mail.md) for periods, seeds, output files and profile handling. The content is synthetic and for testing only.

## Tests

```sh
npx vitest run tests/unit/thunderbird-spike.test.ts tests/unit/thunderbird-assistant.test.ts tests/unit/thunderbird-ui.test.ts
npm run ext:build
npm run send-gate
```

The automated suite uses fakes. Real Thunderbird/IMAP/OAuth/provider validation is tracked as **T174** in `tasks/`; the checklist is [`docs/manual-validation.md`](docs/manual-validation.md) and the requirements/design are in [`docs/requirements.md`](docs/requirements.md) and [`docs/implementation-plan.md`](docs/implementation-plan.md).

## Known limitations

- Drafts are saved with Thunderbird's compose API (TB 102+). Newer builds with `messages.saveMessage` can be adapted without UI changes.
- Tags are best-effort and depend on the Thunderbird version and permission grant.
- Calendar files are exported, not written directly to a calendar.
- No attachment analysis, no sending, no auto-reply, no server-side Sentinel account.
- UI copy is English; the extension is a Thunderbird desktop add-on only.
