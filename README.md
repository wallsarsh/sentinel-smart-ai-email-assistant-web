# Sentinel Web

Browser version of the Sentinel AI email assistant (Nuxt 3 / Vue 3, Node, PostgreSQL). Same features as the mobile app: Gmail, Microsoft 365 and IMAP accounts, bring-your-own AI provider, triage, daily brief, draft replies and human-approved sending.

- Design: [`docs/web-design.md`](docs/web-design.md)
- **Windows / macOS / Linux desktop client (Tauri 2):** [`desktop/README.md`](desktop/README.md)
- Work plan: [`tasks/README.md`](tasks/README.md) and the live [`tasks/INDEX.md`](tasks/INDEX.md)
- Mobile reference docs: [`docs/reference/`](docs/reference/)

**Hard rule:** nothing is ever sent without an explicit human confirmation; this is enforced by architecture and CI.

Start with `python3 tasks/tools/taskctl.py ready`.
