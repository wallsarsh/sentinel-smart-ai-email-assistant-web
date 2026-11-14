# Sentinel AI for Thunderbird

A quiet AI assistant inside Thunderbird. It watches your inboxes, explains what matters, keeps an hourly-updated daily brief, saves reviewable drafts to your own Drafts folder, and turns dated actions into calendar files.

**It never sends, deletes, moves or archives mail.** The add-on does not request send permissions and has no send code path. You review and send every reply yourself, from any device.

## What it does

| Area | Behaviour |
|---|---|
| Monitoring | Checks every inbox on a schedule (default hourly) and shortly after new mail arrives. Only new mail is analysed; results are cached for 14 days. |
| Analysis | Category, **intent**, importance, urgency, P1–P4 priority, needs-reply, summary, reason, action items and calendar candidates. Priority is computed in code. |
| Tags | Best-effort Thunderbird tags: `Sentinel P1…P4`, `Sentinel Reply`, `Sentinel Ignored`. If the tag API is unavailable, analysis still works. |
| Daily brief | One brief for the current local day, built one email at a time with durable progress. A provider failure pauses it and the next refresh resumes from the unprocessed mail. A count badge appears on the brief toolbar icon and a content-free native notification announces the update when enabled. |
| Drafts | For messages that need a reply, at most a few reviewable drafts per run are saved in the account's own Drafts folder, threaded as a reply. Already-replied threads and existing drafts are skipped. |
| Compose assistant | In any reply compose window, the **Sentinel** toolbar button shows the original analysis, a tone picker (Standard…Persuasive), reply intent, length and an optional instruction. Draft text streams into an editable preview, then inserts above the quote; you review and send. Select text and use **Proofread** or **Rewrite** to review word-level changes and accept or reject each one. |
| Sender rules | Mark a sender/domain **Important**, **Marketing** or **Ignore**. Ignore never reaches the AI; Marketing is classified locally unless you opt in; Important is analysed first and raised to high importance. |
| Calendar | Meeting/dated-action candidates can be added as a standards-compliant `.ics` file. Nothing is written to a calendar without your click. |
| Dashboard | Brief, Inbox, Drafts, Senders and Settings in one calm page, with a message popup for the open email. Inbox rows can be selected for bounded **Analyze selected** or **Create drafts** batches. Native message-list and message-display context menus expose the same actions. |

## Install

### One-step installer (downloads Thunderbird and installs the add-on)

```sh
npm ci
npm run install:thunderbird            # or: node installer/install.mjs --help
```

It resolves the latest Thunderbird **ESR** from Mozilla, verifies the published SHA-512 checksum (and refuses to continue without one), installs it for your user only (no admin rights), builds the add-on package and installs it into a profile with the preferences an unsigned add-on needs. On Linux it also adds a `sentinel-thunderbird` launcher and an applications-menu entry.

- By default a **dedicated profile** is created, so you add your mail account once in it. If an existing Thunderbird profile is found you are asked first; choosing it turns off add-on signature checking *in that profile* (close Thunderbird first). `--profile-dir PATH` targets a profile explicitly.
- `--use-system` skips the download and uses a Thunderbird you already have; `--dry-run` shows the plan; `--uninstall` removes the app, launcher and add-on but never your profile or mail.
- Unsigned add-ons load only on the **ESR** channel (the default). Linux x64, macOS and Windows x64 are supported by the downloader; only Linux x64 has been exercised so far. `npm run ext:xpi` writes `installer/sentinel-ai.xpi` if you want the package alone.

### Windows 11 (PowerShell, no Node.js needed)

```powershell
powershell -ExecutionPolicy Bypass -File installer\install.ps1          # or double-click installer\install.cmd
powershell -ExecutionPolicy Bypass -File installer\install.ps1 -DryRun  # show the plan only
```

Same behaviour as above, per user, no administrator prompt: resolves the latest Thunderbird ESR, verifies Mozilla's SHA-512, runs the silent installer into `%LOCALAPPDATA%\SentinelThunderbird\app`, packages the add-on from the committed `thunderbird\dist`, installs it into a dedicated profile (or your existing one if you agree) and adds a **Thunderbird (Sentinel AI)** Start-menu shortcut. Options: `-Channel`, `-Lang`, `-InstallDir`, `-ProfileDir`, `-UseSystem`, `-XpiPath`, `-NoLaunch`, `-Yes`, `-Uninstall`. Works in Windows PowerShell 5.1 and PowerShell 7.

#### One-liner from GitHub (`irm | iex`)

```powershell
irm https://raw.githubusercontent.com/wallsarsh/sentinel-smart-ai-email-assistant-web/main/installer/get.ps1 | iex
```

`installer/get.ps1` downloads the repository zip from GitHub into a temp folder, runs `installer\install.ps1` from it and deletes the folder. Pass options through `SENTINEL_ARGS`, or call it as a script block:

```powershell
$env:SENTINEL_ARGS = '-DryRun'; irm <url> | iex
& ([scriptblock]::Create((irm <url>))) -Yes -NoLaunch
```

`SENTINEL_REF` picks a branch, tag or commit (default `main`). `SENTINEL_ZIP_URL` downloads a different zip, such as an internal mirror. The repository must be **public**, because the script downloads without credentials. Pin `SENTINEL_REF` to a tag or commit if you want a reproducible install, and read the script before piping it to `iex`.

### Manual (development)

```sh
npm ci                 # from the repository root
npm run ext:build      # writes thunderbird/dist (committed so you can load it directly)
```

Thunderbird 140+ → **Tools → Developer Tools → Debug Add-ons → Load Temporary Add-on** → pick `thunderbird/manifest.json`.

Then:

1. Open **Provider settings** and add one or more providers: OpenAI, Anthropic, an OpenAI-compatible endpoint, or a preset for Ollama, LM Studio, Groq, Mistral, OpenRouter or Gemini-compatible. Each key stays in this Thunderbird profile. Press **Load models from provider** to pick the model from a dropdown (fetched from the provider's models endpoint); *Other…* lets you type a name the provider does not list.
2. In **Task routing** choose one **default provider and model for every feature**. Any feature (analysis, brief, drafts, proofreading, rewrite) can untick *Use default* to have its own model. Changing the default updates all features that still use it.
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

- The monitor scans account Inboxes and, by default, Local Folders (excluding Drafts/Sent/Trash/Junk/Outbox). You can switch this off in Dashboard → Settings.
- Auto-drafts are saved through the account identity that received the message, so Thunderbird should place them in that account's configured **Drafts** folder (for IMAP, the server Drafts folder). The dashboard shows the folder name next to each saved draft. If your account's Drafts folder is set to Local Folders in Thunderbird Account Settings, change it to the IMAP Drafts folder there.
- In a reply compose window, click **Sentinel** in the main compose toolbar. Review the original message card, choose a tone, intent and length, optionally add an instruction, then **Generate preview**. Edit the preview and press **Insert into reply**; nothing is sent.
- The compose tone presets are Standard, Professional, Friendly, Concise, Formal, Creative, Casual, Apologetic and Persuasive.

## Daily brief and manual refresh

The brief covers from local midnight to now. It processes messages individually, marks each analysis with its brief window, and saves progress after every message. Provider failures pause the job instead of restarting from scratch; pressing **Refresh brief** resumes the unprocessed mail. A monitor run refreshes it only when new mail was analysed (or at the start of a new day). Notifications say only how many new messages are in the brief — never mail text. Thunderbird does not expose a separate system-tray icon API, so Sentinel uses the count badge on its brief toolbar icon plus a native OS notification, and clears the badge when you open the brief or dashboard.

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

## Selected-message actions

Select one or several messages in Thunderbird’s list and right-click **Sentinel AI**.
The same menu is available on a displayed message. Choose Analyze, Create draft replies,
Summarize, Extract action items, Categorize and apply priority tags, or Add to calendar.
Sender rules apply to every selected sender and affect future analysis. Categorize uses
AI/rule classification and applies Sentinel priority tags; it does not move messages.

The dashboard opens with a progress panel. Work continues if it is closed; reopen the
dashboard to see counts, failures, summaries, categories and action items. Inbox selections
also offer Analyze, Create drafts, Summarize, Action items and Categorize. Summary results
are per message, not a combined narrative. Cached analyses are reused for summaries and
action items; Analyze and Categorize request fresh analysis. Local filtering rules still apply.

Messages are processed sequentially without the former 10-analysis/5-draft truncation.
Only one bulk action runs at a time. Each completed result is saved. After a background
restart unfinished and failed messages are retried by the periodic background task.
Drafts are never sent automatically. Calendar export can create one file per selected
message with dated events.

### Automatic retries and direct calendar writes

Failed or interrupted selected-message jobs are persisted separately from the dashboard's
latest result. A background alarm checks every five minutes and retries pending jobs,
with delays increasing from five to sixty minutes. Completed messages are skipped.
Retry processing continues while Thunderbird runs, even with every Sentinel dialog closed.

Add to calendar now writes directly through the bundled `sentinelCalendar` experiment,
choosing the default writable, enabled event calendar (or the first eligible calendar).
Configure a writable calendar in Thunderbird first. Errors are shown rather than silently
replaced by an ICS download. Stable event IDs allow repeat attempts to recognize an existing
event in the target calendar. No event editor is opened by this implementation.

Research: Thunderbird documents calendar items as `calIEvent` and `calICalendar` objects
(https://source-docs.thunderbird.net/en/latest/calendar/item_model.html); calendar extensions
remain an experiment integration (https://github.com/thunderbird/webext-experiments).
The existing bundled experiment is used rather than assuming a stable browser.calendar API.
