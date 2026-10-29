# Sentinel Desktop (Tauri 2)

A native Windows / macOS / Linux launcher for the existing **Sentinel Web** application. It reuses the full Nuxt + Nitro backend instead of reimplementing mail access or AI processing in Rust.

## Architecture and boundaries

- **Local**: Tauri launcher, tray menu (Open, Server settings, Quit), strict server-origin configuration, platform installers.
- **Remote**: existing Nuxt UI and same-origin API; PostgreSQL, server-side OAuth credentials and cookies, AI routing, IMAP/SMTP, background mail checks and briefs, send-gate controls.
- **Not bundled**: PostgreSQL, Node/Nitro web server, worker, IMAP agents, or decrypted provider secrets.
- The local settings UI has Tauri IPC; **no remote origin** has any native capability. Neither the local shell nor the tray contains a mail-send API.
- Only a sanitized HTTPS origin (or HTTP loopback) is persisted as plain JSON under the OS app config directory.
- External links open in the OS browser. Clicking Gmail or Microsoft account connection in the desktop client opens the **web Accounts page in the system browser** instead of initiating OAuth inside a restricted embedded WebView. Sign in to the same Sentinel account in the browser, complete provider consent there, then choose **Reload workspace** from the desktop tray. The separate browser may ask for a second Sentinel login. No OAuth credentials/tokens cross the desktop IPC boundary.

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

On first launch enter the deployed URL (e.g. `https://mail.example.com`). Later use **Server settings** from the tray menu. Use **Reload workspace** after connecting an account in your system browser. The server URL is the only desktop setting stored; users sign in through the original application.

## OAuth and platform caveats

The original Google/Microsoft OAuth uses a server-side web session and PKCE state cookie. Google generally disallows embedded user agents and federated Microsoft Entra policies can require external identity providers. Consequently, desktop Connect/Reconnect intentionally opens the server's **Accounts settings** in the system browser. Complete the connection there with your existing server credentials, then use **Reload workspace** on the tray to see it inside the desktop app. This works without extending OAuth token access to Tauri, but is not a seamless single-session handoff. A future native deep-link / one-time-ticket flow could remove the second login.

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
- [ ] Verify Microsoft MFA / Conditional Access and Google consent via system-browser Accounts settings and reload the desktop workspace.
- [ ] Confirm external links cannot access Tauri native commands and disallowed schemes fail.
- [ ] Add code signing / macOS notarization and distribution update signing before release.
