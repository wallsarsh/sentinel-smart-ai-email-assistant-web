# Sentinel AI for Thunderbird (spike)

Summarize the open message (priority, summary, action items) and open an AI-drafted reply.
It never sends mail; the draft opens in Thunderbird's compose window.

The prompts, provider adapters and redaction come from `packages/core`, shared with the web and desktop apps.
Prompts use the compact envelope: no attachments, no unneeded headers, no quoted history or footers.

Build: `npm run ext:build` (writes `thunderbird/dist`, which is committed so you can load it without building).
Try it: Thunderbird 140+ → Tools → Developer Tools → Debug Add-ons → Load Temporary Add-on → pick `thunderbird/manifest.json`.
Then open the add-on's settings (API URL, key, model), open a message and click the Sentinel AI toolbar button.
