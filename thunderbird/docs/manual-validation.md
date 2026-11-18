# Thunderbird manual validation (T174)

Run this after `npm run ext:build`, with a disposable test profile and team-owned mailboxes. Record the result in `tasks/items/T174-thunderbird-real-client-validation.md` under **Log**; do not paste mail content, addresses or keys into the log.

## 1. Load and setup

1. Thunderbird 140+ → Debug Add-ons → Load Temporary Add-on → `thunderbird/manifest.json`.
2. Check the browser console for errors on load.
3. Provider settings: HTTPS OpenAI-compatible URL, key, model; grant the origin permission.
4. Dashboard → Refresh now. Confirm status moves from “Checking…” to “Updated …”.
5. Confirm `settings`, `sentinel.monitor`, `brief`, `sentinel.tagKeys` exist in the extension storage inspector.

## 2. Accounts and analysis

| # | Setup | Expected |
|---|---|---|
| A1 | IMAP account with a new plain-text message | Analysed within one interval or ~30 s of arrival; P-tag appears if tagging is available |
| A2 | OAuth account (Gmail or Microsoft) | Same, with no plaintext credentials shown in UI or logs |
| A3 | Message containing `List-Unsubscribe` | Classified as Newsletter locally; no AI call (check provider usage) |
| A4 | Password-reset/OTP mail | Classified `Security`; body is not in the provider request |
| A5 | Exact-address Important rule | Message is analysed first; importance is at least High |
| A6 | Domain Marketing rule | Local classification; no AI call; no draft |
| A7 | Domain Ignore rule | No AI call, no draft, `Sentinel Ignored` tag if available |
| A8 | Re-run with no new mail | No triage calls and no brief call |

## 3. Brief

1. Leave Thunderbird running across two monitor intervals with one new message in each.
2. Confirm the brief updates after new mail, not when nothing arrived.
3. Press **Refresh brief** in the brief popup and **Refresh now** in the dashboard.
4. Confirm every “Open” link opens the referenced message and that counts match the Inbox view.
5. Confirm the notification text (if enabled) contains no subject, sender or body.
6. Stop the provider mid-run, refresh, and confirm the brief shows `processed/total` counts, marks successful messages and pauses. Restart the provider and refresh; confirm it resumes from the unprocessed message without re-processing successful ones.

## 3a. Providers and routing

1. Add an OpenAI provider and an Anthropic provider; confirm the key is preserved when editing without re-entering it.
2. Add an Ollama or LM Studio local provider without a key; confirm it is not marked incomplete.
3. Route analysis to provider A, brief to B and drafts to C; run each feature and confirm the provider usage/log shows the selected model.
4. Remove a provider used by a route; confirm the route falls back to another configured provider.

## 4. Drafts and already-replied detection

1. Note a Needs-reply message with no reply.
2. Run a refresh with auto-draft on. Confirm a draft appears in the account's Drafts folder, threaded (`Re:` subject, In-Reply-To/References), above the quote.
3. Open the same account on a second device and confirm the draft is there and editable; do not send from Sentinel.
4. Reply to a different message in Thunderbird, then run a refresh. Confirm no draft is created for that thread.
5. Create a draft manually in Thunderbird for another Needs-reply message, then run a refresh. Confirm no duplicate.
6. Turn auto-draft off; confirm no new drafts. Use “Save AI draft” in the popup; confirm it still saves one.
7. Confirm the extension has no Send button and no send permission.

## 4a. Streaming, proofread and rewrite

1. Generate a reply and confirm the preview fills progressively, then insert it.
2. Select a sentence in the compose window, choose Proofread, accept one hunk and reject another; confirm only accepted text replaces the selection.
3. Repeat with Rewrite and a different tone; confirm facts/links are preserved.

## 4b. Batch and context menus

1. Select three inbox rows in the dashboard and run Analyze selected; confirm counts and that rules/cache still apply.
2. Select two Needs-reply rows and run Create drafts; confirm at most the batch limit and the draft folder.
3. Right-click selected messages in Thunderbird's message list; run Analyze, Create draft, Add to calendar and each sender rule.

## 5. Calendar

1. Open a message with a concrete meeting date/time. Confirm a calendar candidate appears.
2. Click **Add**. Confirm an `.ics` downloads; open it in Thunderbird Calendar and one external calendar. Check title, start/end, all-day flag, location.
3. Open a message with a dated action item and no meeting. Confirm the action becomes an all-day candidate.
4. Confirm no calendar event is created without clicking Add.

## 5a. Direct calendar writes

1. With the bundled calendar experiment loaded, Add a candidate and confirm the event appears in the selected writable Thunderbird calendar.
2. Disable every writable calendar (or remove the experiment) and Add again: the status names the reason and an `.ics` downloads instead of a generic failure.
2. Temporarily disable/rename the experiment and confirm Add falls back to a downloaded `.ics`.
3. Confirm a failed write after the first event is not retried as an ICS duplicate.

## 5b. Windows Scoop profile

1. Start Thunderbird with the Scoop profile, then close it completely (check Task Manager for `thunderbird.exe`).
2. Run `npm run demo:mail -- --days 5 --apply --profile "C:\\Programs\\Scoop\\Apps\\persist\\thunderbird\\profile"`.
3. If it reports a lock, remove stale `parent.lock`/`lock` from the profile root and retry; the mailbox appears under Local Folders.

## 6. Resilience and accessibility

| # | Test | Expected |
|---|---|---|
| R1 | Invalid provider key | Status shows “rejected the API key”; earlier analyses remain; next run retries only unanalysed mail |
| R2 | Offline / provider timeout | Partial status, no draft; next run continues |
| R3 | Sleep/wake across an interval | Alarm runs after wake; no duplicate drafts |
| R4 | 200% zoom and 320 px window | No horizontal scroll; all actions reachable |
| R5 | Keyboard only | Tabs, forms, popup actions and calendar buttons reachable; focus visible |
| R6 | Dark scheme | Contrast and focus remain readable |
| R7 | Tag permission unavailable | Analysis still succeeds; status shows a tag warning |

## 7. Sign-off

- [ ] All rows above pass, or failures are recorded as new P10 tasks.
- [ ] Provider usage confirms skipped/marketing/security mail was not sent to the model.
- [ ] No send request observed in the provider or mail server logs from background runs.
- [ ] T174 status can move to `review` / `done` with the log filled in.

## Repository update verification, 18 November 2026

A disposable Linux profile installed Sentinel A (0.1.0), checked a branch-specific HTTPS fixture feed, installed B (0.2.0), and retained a marker in extension storage after activation. Exercised Thunderbird 140.0 and 160.0 with a container-local repository fixture and test CA. On 160.0 the extension-page probe also used the Settings background message handlers for check and apply. Production release publication, Windows installation and user-operated accessibility checks require separate validation.

For repeat testing, use two versioned test XPIs with the same Sentinel ID and the same fork's update URL. Seed storage in A, confirm the displayed ref, check for B and apply it. Reopen Settings to confirm the running version and retained settings. Repeat with a changed digest and an open compose window. Both must leave A active.

Also check the failure paths: a branch with no published feed must show "Could not download the update feed" (not a generic error) and link to the repository releases; a temporary install must point at Debug Add-ons; an offline check must time out with a readable message and leave A running.
