# Standalone technical design and feature traceability

## Boundary decisions

| Component | Standalone implementation |
|---|---|
| UI | Original Nuxt/Vue pages in a Tauri WebView |
| API | Bundled Nitro Node 22 localhost process (not a remote backend) |
| Database | PGlite embedded Postgres with original Drizzle schema and migration history |
| Background jobs | Same-process runner using original queue and handlers |
| Credentials | Original envelope encryption with KEK managed by OS credential vault |
| AI | Existing OpenAI / Anthropic / compatible providers and BYOK routing |
| Gmail | Existing Gmail HTTP/OAuth provider, native-browser consent handoff |
| Microsoft | Existing Graph/OAuth provider, native-browser consent handoff |
| IMAP/SMTP | Existing imapflow and nodemailer adapters |
| Drafts | Existing generation/saving and edit-before-send |
| Sending | Existing single-use server-side SendAuthorization gate |
| Export/privacy | Existing local HTTP API |
| Notification | Web Push is not equivalent to native OS notifications; not implemented |
| Packaging | Tauri Windows/macOS/Linux with bundled Node and complete runtime |
| Updates | Manually installed version upgrades; auto-update not yet present |

## Data and lifecycle

The Tauri host first initializes two random keys in OS keychain (a 32-byte KEK and a session signing secret) and starts the **migration command** using bundled Node. After migrations complete, a single Nitro process starts and initializes PGlite at the app-local-data folder. A bounded authenticated health handshake determines readiness before the WebView navigates to loopback.

The PGlite storage is opened in one process; the worker plugin runs there too and reuses the shared DB connection. `useHub` avoids the Postgres cross-process event bridge.

Quit stops the local child. Closing a window leaves the application/tray and worker running.

## OAuth browser handoff

The authenticated WebView requests an OAuth start URL with PKCE. In standalone mode the callback handler stores a one-time `state` associated with `userId`, verifier cookie and expiry in server memory. Tauri redirects the IdP to the OS browser. The loopback callback is not authenticated with the system browser cookie; it **must** consume that exact one-time state and then use existing signed-cookie and PKCE verification before storing the token. Tokens never enter native IPC or browser query return values. Fail closed on missing, reused or expired state.

## Release quality

Native packaging and PGlite persistence CI are necessary, not sufficient: integration tests against real providers on every OS and a pen-test of loopback access are still required before declaring feature parity.
