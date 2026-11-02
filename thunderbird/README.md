# Sentinel AI for Thunderbird

A quiet AI assistant inside Thunderbird. It watches your inboxes, explains what matters, keeps an hourly-updated daily brief, saves reviewable drafts to your own Drafts folder, and turns dated actions into calendar files.

**It never sends, deletes, moves or archives mail.** The add-on does not request send permissions and has no send code path. You review and send every reply yourself, from any device.

## What it does

| Area | Behaviour |
|---|---|
| Monitoring | Checks every inbox on a schedule (default hourly) and shortly after new mail arrives. Only new mail is analysed; results are cached for 14 days. |
| Analysis | Category, **intent**, importance, urgency, P1–P4 priority, needs-reply, summary, reason, action items and calendar candidates. Priority is computed in code. |
| Tags | Best-effort Thunderbird tags: `Sentinel P1…P4`, `Sentinel Reply`, `Sentinel Ignored`. If the tag API is unavailable, analysis still works. |
| Daily brief | One brief for the current local day, refreshed when the monitor finds new mail (hourly at most). You can refresh it at any time. |
| Drafts | For messages that need a reply, at most a few reviewable drafts per run are saved in the account's own Drafts folder, threaded as a reply. Already-replied threads and existing drafts are skipped. |
| Sender rules | Mark a sender/domain **Important**, **Marketing** or **Ignore**. Ignore never reaches the AI; Marketing is classified locally unless you opt in; Important is analysed first and raised to high importance. |
| Calendar | Meeting/dated-action candidates can be added as a standards-compliant `.ics` file. Nothing is written to a calendar without your click. |
| Dashboard | Brief, Inbox, Drafts, Senders and Settings in one calm page, with a message popup for the open email. |

## Install

```sh
npm ci                 # from the repository root
npm run ext:build      # writes thunderbird/dist (committed so you can load it directly)
```

Thunderbird 140+ → **Tools → Developer Tools → Debug Add-ons → Load Temporary Add-on** → pick `thunderbird/manifest.json`.

Then:

1. Open the add-on settings (**Provider settings**) and enter an OpenAI-compatible API URL, key and model. The key is stored only in this Thunderbird profile.
2. Grant the provider origin permission when Thunderbird asks.
3. Open **Dashboard** from the toolbar popup and press **Refresh now** for the first run.

No hosted Sentinel account or server is involved. Mail goes only to the mailbox provider and the AI provider you configured.

## How processing works

```
inbox folders ── headers ── sender rules + bulk/security pre-filter
                                  │                 │
                                  │                 └── local classification (no tokens)
                                  └── PromptBuilder ── OpenAI-compatible provider
                                          │
                     analysis cache + tags + brief + draft eligibility
                                          │
                     Drafts folder (threaded, unsent) + .ics exports
```

- Bodies are trimmed, quoted history and signatures are stripped, and attachments are never read.
- At most 8 messages per AI request; batches are sequential. Defaults cap a run at 80 inspected and 40 AI- analysed messages.
- The brief uses stored summaries, never full bodies.
- Auto-drafts are capped at 3 per run and only for P1/P2 (configurable) messages with no existing reply or draft.

## Sender rules

Add rules in **Dashboard → Senders**, or use the one-click buttons in the message popup.

- Exact address: `alex@acme.example`
- Domain: `@acme.example`
- Subdomains: `@*.acme.example`

Exact addresses beat domains. On equal specificity: Ignore > Important > Marketing > Normal. Bulk/list mail (`List-Unsubscribe`, `Precedence: bulk`, `Auto-Submitted`) is treated as Marketing by default.

## Daily brief and manual refresh

The brief covers from local midnight to now. A monitor run refreshes it only when new mail was analysed (or at the start of a new day); pressing **Refresh brief** regenerates it on demand. Notifications say only that the brief is ready — never mail text.

## Calendar export

Thunderbird's calendar WebExtension API is still an experiment. Sentinel therefore exports RFC 5545 `.ics` files through Thunderbird's downloads API; open the file with Thunderbird, Google Calendar, Outlook or any standards-compliant calendar. This is a deliberate capability boundary, not a hidden write.

## Privacy and safety

- No `compose.send` or `messages.send` permission; no send call in the source.
- Ignored senders, marketing mail and security mail never go to the AI by default; security mail is classified locally.
- Analysis and draft records live in `browser.storage.local`; bodies stay in Thunderbird.
- Errors and status contain no subject lines, bodies or addresses.
- Provider URL must be HTTPS (or localhost for a local model server).

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
