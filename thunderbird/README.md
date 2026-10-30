# Sentinel AI for Thunderbird (spike)

Smallest useful slice: summarize the open message and open an AI-drafted reply.
It never sends mail; the draft opens in Thunderbird's compose window.

Try it: Thunderbird 140+ → Tools → Developer Tools → Debug Add-ons → Load Temporary Add-on → pick `manifest.json`.
Then open the add-on's settings (API URL, key, model), open a message and click the Sentinel AI toolbar button.

Spike questions to answer on a real profile (not verifiable in CI):

1. `messageDisplay.getDisplayedMessage` from a popup in a message tab and in the 3-pane window.
2. `compose.beginReply` with `body` + `isPlainText` keeps the quoted original and signature.
3. `permissions.request` for the provider host from an options page.
4. Calls to a localhost OpenAI-compatible server (Ollama, LM Studio).
