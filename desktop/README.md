# Sentinel Desktop (Tauri 2)

A native Windows / macOS / Linux launcher for the existing **Sentinel Web** application. It reuses the full Nuxt + Nitro backend instead of reimplementing mail access or AI processing in Rust.

## Architecture and boundaries

- **Local**: Tauri launcher, tray menu (Open, Server settings, Quit), strict server-origin configuration, platform installers.
- **Remote**: existing Nuxt UI and same-origin API; PostgreSQL, server-side OAuth credentials and cookies, AI routing, IMAP/SMTP, background mail checks and briefs, send-gate controls.
- **Not bundled**: PostgreSQL, Node/Nitro web server, worker, IMAP agents, or decrypted provider secrets.
- The local settings UI has Tauri IPC; **no remote origin** has any native capability. Neither the local shell nor the tray contains a mail-send API.
- Only a sanitized HTTPS origin (or HTTP loopback) is persisted as plain JSON under the OS app config directory.
- External links open in the OS browser. The allowed embedded IdP domains are deliberately narrow; additional enterprise/federated login domains require a tested external-browser handoff rather than a blanket navigation allowance.

## Prerequisites

1. Deploy the existing web application and worker as described in [deployment.md](../docs/deployment.md), run migrations and expose it at a stable **HTTPS URL**. Keep `BASE_URL` equal to the browser-visible origin.
2. Install Rust stable, Node.js 22+, and platform-specific Tauri 2 prerequisites:
   - Windows: Microsoft C++ Build Tools, WebView2 (normally already installed).
   - macOS: Xcode Command Line Tools.
   - Linux (Debian/Ubuntu): `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev librsvg2-dev libayatana-appindicator3-dev`.
3. Existing OAuth client registrations remain **web** registrations with callbacks under that URL. No OAuth secrets are bundled.

## Run and build

From the repository root:

```sh
cd desktop
npm run dev       # generates native icons, opens development desktop app
npm run build     # generates native icons and builds host OS installers
```

Or manually: `npx --yes @tauri-apps/cli@2 icon ../public/icons/icon-512.png --output src-tauri/icons`, then `npx --yes @tauri-apps/cli@2 build`.

Build outputs: `desktop/src-tauri/target/release/bundle/`.

On first launch enter the deployed URL (e.g. `https://mail.example.com`). Later use **Server settings** from the tray menu. The server URL is the only desktop setting stored; users sign in through the original application.

## OAuth and platform caveats

The original Google/Microsoft OAuth starts on the same web origin with a server session and PKCE state cookie. Embedded webviews are **not guaranteed** to be accepted by Google or Microsoft identity policies. Google generally disallows embedded user agents, and federated Microsoft Entra tenants can redirect to an additional IdP not on the embedded allowlist. A production-ready native OAuth experience will require a separate system-browser account-linking handoff (with server-side one-time tickets and anti-replay validation). This implementation **does not claim** to solve that flow; use existing connected accounts or validate each provider on real devices.

Web Push/service workers and downloads vary by WKWebView / WebView2 / WebKitGTK; server-side background processing remains active irrespective of the desktop window. This release does not implement native notifications, auto-updates, offline mail or a bundled server. No notarization or signing identity is provided; release signing must be configured before distribution.

## Quality checks

```sh
cargo test --manifest-path desktop/src-tauri/Cargo.toml
npm run check          # from repository root: original web checks and the send-gate
```

[Desktop CI](../.github/workflows/desktop.yml) builds unsigned installers on all three OS families and runs Rust tests. It is separate from existing web production workflows. Avoid enabling remote Tauri capabilities or a WebView HTTP proxy for API requests: both weaken origin and session protections.

## Release verification checklist

- [ ] Package the application on Windows, macOS and Linux.
- [ ] Start against an HTTPS Sentinel server and verify session login/logout.
- [ ] Validate inbox, search, briefs, actions, triage, AI provider settings, draft save, and human-approved send + Undo.
- [ ] Confirm server worker jobs continue after the window is closed.
- [ ] Verify Microsoft MFA / Conditional Access and Google consent on real target devices (embedded flows may be blocked).
- [ ] Confirm external links cannot access Tauri native commands and disallowed schemes fail.
- [ ] Add code signing / macOS notarization and distribution update signing before release.
