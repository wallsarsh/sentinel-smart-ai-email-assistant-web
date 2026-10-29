# Sentinel AI Email Assistant — Standalone Desktop

## What this implementation delivers

Standalone Tauri 2 for Windows, macOS and Linux. Installation bundles a platform-specific **Node 22 executable**, a compiled **Nuxt/Nitro** web/UI+API runtime, persistent embedded **PGlite** database and the existing **worker** logic.

**No hosted Sentinel backend, running PostgreSQL instance, Docker or Node installation required on user devices.** Ordinary internet connectivity is still needed to access Gmail/Graph/IMAP mailboxes and configured AI providers. This is not an offline LLM or offline email-delivery system.

Existing functionality is reused rather than reimplemented: inbox, search, account management, actions, triage, daily briefs, provider-agnostic BYO AI, secure secret store, draft approval, delayed human-authorized sending and Undo, settings, privacy, retention and local audit. The existing `tools/send-gate-check.mjs` must remain green.

### Architecture

```text
Tauri desktop window + tray
  | (HTTP only on loopback 127.0.0.1:17861)
  v
Bundled local Node 22 / compiled Nuxt + Nitro
  |-- REST APIs + browser-side Vue UI
  |-- encrypted secret store (AI keys, provider tokens, IMAP/SMTP passwords)
  |-- existing Gmail / Microsoft Graph / IMAP / SMTP adapters
  |-- existing AI triage, brief, draft, send-gate and Undo
  |-- background worker running inside SAME Node process
  +-- embedded PGlite NodeFS at OS appLocalDataDir/pglite
             ^
             |
OS Keychain/Credential Manager/Secret Service
  stores session signing secret, data wrapping key,
  and optional OAuth client configuration
```

Tauri permissions are only available on the **bundled local settings page**. The main Nuxt app loaded from loopback has no native IPC permissions. HTTP server listens only on `127.0.0.1`, checks user sessions, CSRF and origin. Port 17861 is reserved for the desktop runtime; an occupied port causes startup failure rather than connecting to an unrelated service.

## Build requirements (developer machines only)

- Node.js 22+, npm and Rust stable
- Windows: C++ build tools and Microsoft WebView2
- macOS: Xcode CLT
- Debian/Ubuntu: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev`
- macOS Keychain, Windows Credential Manager or a working Linux Secret Service session for data encryption. No fallback to plaintext key files.

```sh
npm ci                # from repository root
cd desktop
npm run dev           # prepare Nitro, worker, Node modules, Node binary, icons and launch Tauri
npm run build         # unsigned host OS installer
```

Build artifacts go to `desktop/src-tauri/target/release/bundle/`. Packaging builds for all OS families run in `.github/workflows/desktop-standalone.yml`; upload artifacts are temporary and unsigned.

## Initial use

1. Launch the installed app. It generates encryption/signing secrets in the OS credential vault and creates/migrates its local PGlite data store.
2. Create a local Sentinel account in the bundled UI; this account is local to the device, not a cloud account. Sign in with the password and optionally enable MFA as before.
3. For generic IMAP/SMTP, follow the regular in-app IMAP wizard; credentials are encrypted by the pre-existing secret store.
4. To connect Gmail or Microsoft 365, open **Provider settings** from the tray icon and enter your own OAuth desktop/public client ID. The secret fields are optional and stored in the OS credential store. The UI's normal Connect button initiates the flow; provider consent/MFA opens in your system browser. Return to the desktop window and choose Reload workspace after consent.
5. Add one or more AI provider API keys in the regular AI settings UI, choose routing and give provider consent. There is no bundled remote AI account or model.
6. Configure checking intervals and daily brief schedules as in the web version. Closing the window leaves the worker running in the tray; Quit stops it.

### Registering OAuth apps

OAuth registrations are not included in the installer. Set up a Google **Desktop** OAuth client and a Microsoft Entra client with the required delegated mail permissions, user/public client or loopback redirect configuration per provider policy. Native callback URIs for this implementation:

- `http://127.0.0.1:17861/api/accounts/google/callback`
- `http://127.0.0.1:17861/api/accounts/microsoft/callback`

For Google desktop OAuth, the registered desktop app configuration may use an installed-client loopback redirect with arbitrary local port. For Microsoft, ensure public-client redirect support and tenant-level delegated Mail.Read/Mail.ReadWrite consent. Some tenants require administrator consent or disallow custom clients. **These provider configurations require validation against actual accounts and tenant policies before distribution.**

### Security and data

- PGlite NodeFS persists mail data inside the OS user app data directory. The **provider/AI credentials** are additionally encrypted using envelope encryption and a wrapping key retrieved from the OS keychain. The database itself is **not fully encrypted**; disk encryption (BitLocker, FileVault, LUKS) is recommended.
- Local HTTP API uses cookies + CSRF, with no LAN listening. Browser/web page security tests from the web edition remain applicable.
- Secrets are passed to the local Node child via process environment. On shared/untrusted machines, users with sufficient local process privileges may access them; full local process hardening remains a separate security review item.
- Browser-based OAuth uses a bounded, single-use PKCE state handoff stored only in the local process; no session cookie is given to the external system browser.
- Keep a secure backup of the OS credential vault as well as your local app data. Loss of the KEK means encrypted provider credentials cannot be recovered.
- The user explicitly confirms every send. Automated agents and background jobs are never granted send authorization.
- Native OS notifications are produced by the existing notification policy and delivered through a private local queue to Tauri. Notification text contains no mail content. No automatic updates, offline LLM, code signing, disk encryption or installer notarization are included.

## Tests and release gates

```sh
npm run check                # root web safety gate, tests and typecheck
node tools/build-worker.mjs   # root, build worker/migrations
cd desktop
npm run test:db               # local PGlite persistence smoke test
npm run prepare               # makes full independent runtime
cargo test --manifest-path src-tauri/Cargo.toml
npm run build                 # installers, host OS
```

Before a production declaration, verify on actual Windows/macOS/Linux machines:
- Initial local signup/login/MFA and restart persistence
- IMAP/SMTP autodiscovery, sync, folder selection and draft saving
- Gmail installed-client loopback OAuth, token refresh, draft save; Google may require app verification
- Microsoft Entra consent + MFA / Conditional Access with real tenant; Graph token refresh
- Claude, OpenAI and compatible provider API keys, model routing, triage, briefs and streamed drafts
- Human-approved send, undo window and one-shot authorization test for **all** mail providers
- App running minimized with scheduled background checks and sleep/wake recovery
- Privacy export/delete, local audit and system-keychain error handling
- LAN/API-origin security, service restart and recovery from occupied port
- Signed/notarized release build and security review

### Engineering constraints

PGlite handles one writer/process; the worker is deliberately co-located in Nitro. No other process must open the same PGlite directory concurrently. The loopback service runs while the desktop app is running (including in the tray), not when fully quit. A feature requiring an always-on system daemon or a fully offline AI model is outside this release.

The original connected desktop version remains available on branch `feature/tauri-desktop`.
