# Sentinel — Smart AI Email Assistant
## Business Requirements Document (BRD)

| Field | Value |
|---|---|
| Document ID | SENT-BRD-001 |
| Version | 1.1 (Draft for review) |
| Date | 2026-10-27 |
| Product | Sentinel — Smart AI Email Assistant (mobile) |
| Platforms | Android, iOS (Flutter) |
| Status | Draft — awaiting stakeholder sign-off |

---

## 1. Executive Summary

Knowledge workers receive dozens to hundreds of emails a day across several mailboxes (personal Gmail, work Microsoft 365, legacy IMAP accounts). Finding the few messages that matter, working out what is being asked of them, and replying in time takes a large share of the working day.

**Sentinel** is a mobile app for Android and iOS that connects to the user's existing mailboxes and to an AI provider of the user's choice (Claude, ChatGPT, or any OpenAI-compatible provider) using the user's own API key. It:

1. **Summarizes** the day's email into a short daily brief.
2. **Segregates** messages by **importance**, **priority**, and whether they carry **actionable items**.
3. **Extracts action items** (tasks, deadlines, requests, meetings) into a single list.
4. **Drafts replies** for emails that need a response. The user reviews and edits each draft, then **sends it from Sentinel** or keeps it as a draft in their own mailbox.
5. **Checks for new mail in the background**, the way other mail apps do, and notifies the user about important messages.

**Hard rule: no email is ever sent without an explicit human action.** Sentinel can send email, but only when the user taps **Send** on a reply they have reviewed and confirmed. The AI, background jobs, notifications and automations can never send, schedule or auto-reply. The rule is enforced in the architecture, not just in the UI (see §6.4).

Sentinel is **local-first**. There is no Sentinel back-end that stores mail or credentials. Email content travels only between the device, the user's email provider, and the AI provider(s) the user configured. All credentials and API keys are held in the platform's hardware-backed secure storage.

### Revision history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-27 | Initial draft |
| 1.1 | 2026-10-27 | Stakeholder decisions: (1) user-initiated **send** in scope, guarded by a human-approval gate; AI and background never send. (2) **Background mail checking** without a server. (3) AI providers **and** models fully configurable per task. OQ-1 and OQ-2 resolved. |

---

## 2. Business Objectives

| ID | Objective | Measure of success (12 months after launch) |
|---|---|---|
| BO-1 | Cut the time users spend triaging email | Users report ≥ 30% less triage time (in-app survey); median time-to-first-reply on "Needs reply" mail falls by ≥ 20% |
| BO-2 | Make sure important or actionable email is not missed | ≥ 85% of messages users manually re-classify agree with the AI's original "Important / Needs reply" flag (precision proxy) |
| BO-3 | Speed up replies while keeping the user in control | ≥ 40% of AI drafts are sent by the user with light edits (edit distance < 30%); **0** emails sent without an explicit, confirmed user action |
| BO-4 | Earn trust with sensitive data | 0 critical security findings at launch (external pen test); passes Google OAuth verification incl. CASA, Microsoft publisher verification, App Store & Play review |
| BO-5 | Stay provider-agnostic | Support ≥ 3 email provider types and ≥ 3 AI provider types at GA |

---

## 3. Scope

### 3.1 In scope (MVP / v1.0)

- Flutter mobile app for **Android** and **iOS** (phones; tablets usable but not tablet-optimized).
- Email account connection:
  - **Gmail / Google Workspace** via OAuth 2.0 (Gmail API).
  - **Microsoft 365 / Outlook.com / Exchange Online** via the Microsoft identity platform (OAuth 2.0 + PKCE) and Microsoft Graph, **including tenants that enforce MFA and Conditional Access**.
  - **Generic IMAP + SMTP** using username + password or app-password, over TLS (IMAP to read and store drafts, SMTP to send).
- Several accounts at once, with a unified view and a per-account view.
- AI provider connection by **API key**:
  - **Anthropic Claude** (Messages API).
  - **OpenAI ChatGPT models** (OpenAI API).
  - **Any OpenAI-compatible endpoint** (custom base URL + key + model), e.g. Azure OpenAI, Mistral, Groq, OpenRouter, Together, Google Gemini's OpenAI-compatible endpoint, or a self-hosted gateway.
- Fully configurable AI: any number of providers, a provider **and model** chosen per task (triage, brief, draft), custom model IDs and per-task parameters.
- Daily brief / summary, importance & priority classification, action item extraction, "needs reply" detection.
- AI-drafted replies the user can edit, regenerate (change tone/length), discard, save as a **draft** in the source mailbox, or **send after review and confirmation** (human-initiated only).
- **Background new-mail checking** without a server (Android: periodic background work; iOS: system-scheduled background refresh, best effort), with local notifications for important mail.
- Secure credential and API key storage, optional biometric app lock, encrypted local cache.
- Usage/cost visibility (token counts, estimated spend) and user-set limits.

### 3.2 Out of scope (v1.0)

- **Any sending not initiated by the user**: auto-send, auto-reply, scheduled/delayed send beyond the short undo window, sending from notifications, sending by AI or background jobs.
- Composing brand-new emails (not replies) and forwarding. Candidate for v1.1 (same send gate).
- Real-time push via a Sentinel server (no server in v1; see §6.9 for what background checking can and cannot do).
- Deleting, archiving, moving or labeling mail on the server (no server-side changes apart from drafts and sending). Candidate for v1.1.
- Calendar write-back (creating events/tasks in Google/Microsoft). v1.x candidate.
- Attachment content analysis (attachment *names and types* are considered; contents are not sent to AI in v1).
- Sentinel-hosted AI ("bring your own key" only), Sentinel cloud back-end, web or desktop clients.
- POP3, Exchange on-premises (EWS), Yahoo/iCloud-specific OAuth (iCloud and Yahoo work via IMAP + app password).
- Team/shared mailboxes and delegated access.

---

## 4. Stakeholders & Personas

### 4.1 Stakeholders

| Role | Interest |
|---|---|
| Product Owner | Feature scope, success metrics |
| Engineering (Flutter, QA) | Build, test, ship |
| Security & Privacy | Credential handling, data flows, compliance |
| Legal | Privacy policy, Google/Microsoft API terms, AI disclosures |
| End users | Time saved, trust, control |
| Enterprise IT admins (customer side) | Admin consent in Entra ID, Conditional Access compatibility |

### 4.2 Personas

| Persona | Description | Key needs |
|---|---|---|
| **Priya — Busy Professional** | Director at a mid-size company, M365 with MFA, 150+ mails/day, mostly reads on the phone between meetings | Morning brief, never miss exec requests, quick replies |
| **Marco — Freelancer / Small Business** | Gmail + an IMAP mailbox from his web host, juggles clients | One view across accounts, action items with deadlines, polite replies |
| **Dana — Privacy-Conscious Power User** | Uses her own OpenAI-compatible gateway or a specific provider, wants control over what data goes where | BYO key, provider choice, local storage, clear data controls |

---

## 5. Assumptions & Constraints

| ID | Assumption / Constraint |
|---|---|
| A-1 | Users supply and pay for their own AI provider API key. Sentinel does not resell AI. |
| A-2 | No Sentinel server stores mail or credentials. A minimal service *may* exist later for push notifications (would carry no mail content). |
| A-3 | Gmail access needs **restricted** OAuth scopes. Google requires OAuth app verification and an annual third-party security assessment (CASA) for restricted scopes. Lead time is weeks to months and must be planned (see §11). Sending does not change this: the same scope covers drafts and send. |
| A-4 | Microsoft 365 tenants may require **admin consent** for third-party apps, and Conditional Access may block unmanaged devices. Sentinel cannot bypass tenant policy. |
| A-5 | Mobile OSes limit background execution. Android allows periodic background work (minimum interval 15 min) that runs reliably except under heavy battery restrictions. iOS decides on its own when (and whether) background refresh runs; without a push server Sentinel cannot guarantee near-real-time checks on iOS. Everything also runs when the app is opened. |
| A-6 | AI output can be wrong. The product treats AI output as advisory; every action that changes state on the server (save draft, send) requires an explicit user action, and sending also requires confirmation. |
| C-1 | Flutter (stable channel), single codebase for Android & iOS. |
| C-2 | Minimum OS: Android 8.0 (API 26), iOS 16. (Final values confirmed in Sprint 0 against package requirements.) |
| C-3 | Email content is untrusted input and may contain prompt-injection attempts. |

---

## 6. Functional Requirements

Priority uses **MoSCoW**: **M** = Must (MVP), **S** = Should (MVP if time allows, else v1.1), **C** = Could, **W** = Won't (this release).

### 6.1 Onboarding & App Security (FR-ONB, FR-SEC)

| ID | Requirement | Pri |
|---|---|---|
| FR-ONB-01 | First-run onboarding explains what Sentinel does, the rule that nothing is sent without the user's review and confirmation, and where data goes (device ↔ email provider ↔ chosen AI provider). | M |
| FR-ONB-02 | The user must accept the privacy notice and an explicit **AI data-sharing consent** before any email content is sent to an AI provider. Consent is per AI provider and can be withdrawn. | M |
| FR-ONB-03 | Guided setup: connect ≥ 1 email account → connect ≥ 1 AI provider → choose digest time → done. Each step can be skipped and finished later. | M |
| FR-SEC-01 | Optional app lock with biometrics (Face ID / Touch ID / Android BiometricPrompt) or device PIN; lock on launch and after a configurable inactivity timeout (default 5 min). | M |
| FR-SEC-02 | Hide app contents in the OS app switcher / recent apps (blur/secure flag). | M |
| FR-SEC-03 | Users can wipe all local data (accounts, keys, cache) from Settings; app reinstall must not restore secrets. | M |
| FR-SEC-04 | Detect rooted/jailbroken devices and warn the user (do not block). | S |

### 6.2 Email Account Connection (FR-ACC)

| ID | Requirement | Pri |
|---|---|---|
| FR-ACC-01 | Connect **Gmail / Google Workspace** with OAuth 2.0 Authorization Code + PKCE in the system browser. Request only the scopes needed to read mail and create drafts. | M |
| FR-ACC-02 | Connect **Microsoft 365 / Outlook.com** with Microsoft identity platform OAuth 2.0 + PKCE in the system browser / broker. MFA (Authenticator push, number matching, TOTP, SMS, FIDO2/passkeys), Conditional Access prompts, and tenant admin-consent flows must complete. | M |
| FR-ACC-03 | For M365, request **delegated** Graph permissions `Mail.ReadWrite` (read, drafts), `Mail.Send` (user-initiated send), `User.Read`, `offline_access`. No application permissions. | M |
| FR-ACC-04 | Connect **generic IMAP + SMTP** with: email, display name, IMAP host/port/security (SSL/TLS or STARTTLS), **SMTP host/port/security** (465 implicit TLS or 587 STARTTLS), username(s), password/app-password (SMTP defaults to the IMAP credentials, can be set separately). Auto-discover both (Mozilla ISPDB/autoconfig, DNS SRV RFC 6186/6186-submission) where possible. The connection test checks IMAP login **and** SMTP `EHLO`/TLS/`AUTH` without sending a message. | M |
| FR-ACC-05 | Plaintext (non-TLS) connections are refused. Invalid/self-signed certificates are refused in v1. | M |
| FR-ACC-06 | Test the connection before saving and show actionable errors (wrong password, app password needed, IMAP disabled, admin consent required, Conditional Access blocked, etc.). | M |
| FR-ACC-07 | Connect several accounts (target ≤ 5 in v1); each has a color/label; unified inbox plus per-account filter. | M |
| FR-ACC-08 | Refresh OAuth tokens silently; when re-authentication is needed (password change, revoked consent, MFA re-prompt), show a non-blocking "Reconnect" banner. | M |
| FR-ACC-09 | Remove an account: revoke tokens where the provider supports it, delete stored credentials and all cached data for that account. | M |
| FR-ACC-10 | Choose which folders/labels to process (default: Inbox only, last 7 days on first sync). | S |
| FR-ACC-11 | IMAP/SMTP with OAuth (XOAUTH2) for providers that support it (e.g. Gmail/Outlook via IMAP). | C |
| FR-ACC-12 | For IMAP accounts, detect the **Sent** folder (SPECIAL-USE `\Sent` + fallbacks) and whether the server already saves sent copies (e.g. Gmail), so a sent reply is stored exactly once. | M |

### 6.3 AI Provider Connection (FR-AI)

| ID | Requirement | Pri |
|---|---|---|
| FR-AI-01 | Add an **Anthropic Claude** provider with an API key; the base URL can be overridden for Anthropic-compatible gateways. | M |
| FR-AI-02 | Add an **OpenAI** provider with an API key (optional Organization/Project ID). | M |
| FR-AI-03 | Add an **OpenAI-compatible** provider: display name, base URL (HTTPS required, except an explicit "local network" toggle for LAN gateways), API key, optional custom auth header name (e.g. `api-key` for Azure), optional extra query parameters (e.g. `api-version`). **Presets** pre-fill base URL and header for common services (Azure OpenAI, Mistral, Groq, OpenRouter, Together, Google Gemini OpenAI-compatible endpoint, Ollama/LM Studio); every preset field stays editable. | M |
| FR-AI-04 | Validate the key on save (list models or a minimal test call) and fill the model picker from the provider's model list where available; the list can be refreshed at any time and **manual model ID entry is always possible**. | M |
| FR-AI-05 | API keys are stored only in secure storage, are never shown again in full after saving (masked `sk-…a1b2`), are never logged, and are never sent anywhere except the configured provider's endpoint. A key can be replaced without removing the provider. | M |
| FR-AI-06 | Any number of providers can be configured. For **each task** (triage, daily brief, draft reply) the user chooses the **provider and model** independently; a global default applies where nothing is set. Changes take effect on the next AI call without restarting. | M |
| FR-AI-07 | Usage tracking: tokens in/out per provider and model per day, estimated cost (user-editable price per model), optional daily token/cost cap that pauses AI processing when reached. | M |
| FR-AI-08 | Ordered **fallback chain** per task: if the chosen provider fails (outage, rate limit, refusal), try the next configured provider/model (opt-in; each provider in the chain needs its own AI consent). | S |
| FR-AI-09 | Per-task **parameters**: max output tokens, reasoning effort where the provider supports it, batch size (triage), streaming on/off (drafts), structured-output mode (auto / JSON schema / JSON object / prompt-only) for compatible providers. Sensible defaults; "Reset to defaults" available. | S |
| FR-AI-10 | No model ID is hard-coded in feature logic. Suggested models shown in the picker come from a catalog shipped with the app and are only suggestions; the provider's live model list and the user's choice always win. | M |
| FR-AI-11 | "Test" button per task runs a sample (synthetic) email through the selected provider/model and shows the result, tokens and latency, so users can compare models before switching. | S |

### 6.4 Draft Replies & Human-Approved Sending (FR-DRF, FR-SND)

**Principle:** the AI writes, the human decides. Sentinel can send email, but a send can only start from a deliberate user action on a reply the user has reviewed, and must pass the **send gate** (FR-SND-03). Nothing automated (AI, background job, notification, retry logic) can start a send.

#### Drafts

| ID | Requirement | Pri |
|---|---|---|
| FR-DRF-01 | For an email flagged "Needs reply" (or on demand for any email), generate a reply draft from the thread context, the user's display name/signature and a chosen **tone** (Professional, Friendly, Concise, Formal) and **intent** (Accept, Decline, Ask for more info, Acknowledge, Custom instruction). | M |
| FR-DRF-02 | Show the draft in an editor; the user can edit freely, regenerate, change tone/length, or discard. | M |
| FR-DRF-03 | On "Save draft", create the draft **in the user's mailbox** as a proper reply in the same thread (correct `In-Reply-To`, `References`, subject `Re:`, recipients), so it shows up in the Drafts folder of the user's normal mail client. Unsaved edits are also kept locally so nothing is lost if the app closes. | M |
| FR-DRF-05 | After saving, offer "Open in Gmail / Outlook / Mail app" (deep link where available) for users who prefer to send from their usual client. | S |
| FR-DRF-06 | Drafts are labeled internally as AI-generated; the user can optionally add a footer such as "Drafted with AI assistance" (off by default). | C |
| FR-DRF-07 | Draft generation never invents commitments: if the reply would need facts the AI doesn't have (dates, prices, attachments), it inserts clearly marked placeholders like `[confirm date]`, and the editor highlights them. | M |
| FR-DRF-08 | Warn before saving a draft that still contains unresolved placeholders. | S |
| FR-DRF-09 | "Reply all" vs "Reply" selection; default follows the original's recipients but never adds new external recipients the original thread did not contain. The user can add/remove recipients manually. | M |

#### Sending (human-initiated only)

| ID | Requirement | Pri |
|---|---|---|
| FR-SND-01 | The composer has a **Send** button. It is enabled only when the reply has at least one recipient and a non-empty body, and the user has scrolled through / viewed the full body at least once (review requirement). | M |
| FR-SND-02 | Tapping Send opens a **confirmation sheet** showing From (account), To/Cc, subject, the full final body and signature, and warnings: unresolved `[placeholders]` (send blocked until resolved or explicitly overridden), recipients not on the original thread, external-domain recipients, links/phone numbers not in the original thread. The user confirms with a deliberate action (e.g. "Send now" button; optional slide-to-send). | M |
| FR-SND-03 | **Send gate:** a send executes only with a one-time **send authorization** created by the confirmation sheet from the user's tap. The authorization is bound to a hash of exactly what was shown (account, recipients, subject, body); any change after confirmation voids it. It expires after 2 minutes and is single-use. AI, background, notification and sync code cannot create or use an authorization (enforced by code structure, CI checks and tests). | M |
| FR-SND-04 | **Undo window:** after confirmation, the send waits for a configurable delay (default 5 s; 0–30 s) with a visible "Undo" control. Undo returns the user to the editor with the content intact. If the app goes to the background during the window, the send is **cancelled** and kept as a draft (with a local notification saying so). | M |
| FR-SND-05 | Optional **"Require Face ID / fingerprint to send"** setting (default off). When on, confirmation also requires device authentication. | S |
| FR-SND-06 | Sending uses the account's own channel: Gmail API (send the saved draft), Microsoft Graph (send the saved draft), SMTP for IMAP accounts (then store a copy in Sent unless the server does that itself, and remove the draft). The sent message is correctly threaded. | M |
| FR-SND-07 | **No automatic retries for sending.** If the result is uncertain (timeout after submission started), Sentinel checks the Sent folder for the message before offering "Retry"; it never re-submits without the user tapping again. | M |
| FR-SND-08 | No send capability anywhere else: no send from notifications or widgets, no "quick reply" without opening the composer, no scheduled send, no auto-reply, no bulk send, no send triggered by AI output. | M |
| FR-SND-09 | A local **sent log** records each send (account, time, recipients count, content hash, status) for the user's own reference and support; no content leaves the device. | S |
| FR-SND-10 | Daily send limit per account (default 100) as a safety brake against misuse of a stolen unlocked device. | C |

### 6.5 Triage: Importance, Priority & Actionable Items (FR-TRI)

Definitions used in the product:

- **Importance** — how much the email matters to *this* user, regardless of time: `High`, `Medium`, `Low`.
- **Urgency** — how time-sensitive it is: explicit/implicit deadlines, "today", "ASAP", meeting soon.
- **Priority** — derived from importance × urgency, shown as `P1 Do now`, `P2 Do today`, `P3 This week`, `P4 Whenever / FYI`.
- **Actionable item** — a concrete thing the user is asked or expected to do (reply, approve, review, pay, attend, provide document), with an optional due date.
- **Category** — `Direct/Personal`, `Work request`, `Meeting/Calendar`, `Finance/Billing`, `Notification/Automated`, `Newsletter/Marketing`, `Social`, `Security/Account`, `Other`.

| ID | Requirement | Pri |
|---|---|---|
| FR-TRI-01 | Each new email (within processed folders) gets: category, importance, urgency, priority, needs-reply flag, a 1–2 sentence summary, extracted action items (with due dates when stated), and a short "why" explanation. | M |
| FR-TRI-02 | Cheap deterministic pre-filtering before AI: bulk/newsletter detection (`List-Unsubscribe`, `Precedence: bulk`), no-reply senders, known automated domains. Pre-filtered mail is labeled without an AI call unless the user opts in. | M |
| FR-TRI-03 | Smart inbox segments: **Needs Reply**, **Action Items**, **Important**, **FYI**, **Newsletters & Notifications**, plus "All". Counts shown per segment. | M |
| FR-TRI-04 | **VIP senders** and **muted senders/domains**: VIP mail is always at least High importance; muted mail is always Low and never AI-processed. | M |
| FR-TRI-05 | The user can correct a classification (importance/priority/needs-reply). Corrections are stored locally and fed back as few-shot hints for that sender/domain on later classifications. | S |
| FR-TRI-06 | Action items list across all accounts: mark done, snooze, open source email, sort by due date/priority. | M |
| FR-TRI-07 | Security-sensitive mail (password resets, OTP codes, login alerts) is classified `Security/Account` and **its body is not sent to the AI** (subject/sender heuristics only). | M |
| FR-TRI-08 | Thread awareness: classification and drafts use the whole thread (trimmed), not just the last message. | M |
| FR-TRI-09 | Export action items to the device calendar/reminders (user-initiated). | C |

### 6.6 Daily Summary / Brief (FR-SUM)

| ID | Requirement | Pri |
|---|---|---|
| FR-SUM-01 | Generate a **Daily Brief** covering mail received since the previous brief (default window: last 24 h), with: headline (2–3 sentences), top priorities (P1/P2), mails needing a reply, action items due today/overdue, notable FYIs, and counts by category. | M |
| FR-SUM-02 | Brief time is user-configurable (default 07:30 local). The app schedules background generation **best effort** and generates on open if the scheduled run didn't happen. | M |
| FR-SUM-03 | Local notification when the brief is ready (opt-in), with no email content in the notification text unless the user enables "show previews". | M |
| FR-SUM-04 | Every brief item links to its source email(s). | M |
| FR-SUM-05 | On-demand "Catch me up" summary for any time range (e.g. since 2 pm, last 3 days). | S |
| FR-SUM-06 | Brief history kept for 30 days (configurable). | S |
| FR-SUM-07 | Read the brief aloud (TTS). | C |

### 6.7 Reading Email (FR-READ)

| ID | Requirement | Pri |
|---|---|---|
| FR-READ-01 | List view with sender, subject, AI summary line, priority chip, account color, time, unread state. | M |
| FR-READ-02 | Detail view: AI summary + action items + "why" at top, then the original message (sanitized HTML, remote images blocked by default, links show the real URL before opening). | M |
| FR-READ-03 | Thread view (conversation). | M |
| FR-READ-04 | Pull-to-refresh and incremental sync. | M |
| FR-READ-05 | Search across cached mail (subject/sender/summary) on-device. | S |
| FR-READ-06 | Mark read/unread on the server. | C (v1.1) |

### 6.8 Settings & Data Controls (FR-SET)

| ID | Requirement | Pri |
|---|---|---|
| FR-SET-01 | Manage email accounts and AI providers (add, edit, reconnect, remove). | M |
| FR-SET-02 | Choose per-task model; set daily token/cost cap; view usage. | M |
| FR-SET-03 | Privacy controls: what is sent to AI (body / subject only), max characters per email, redact patterns (emails, phone numbers, card numbers) before sending, exclude accounts/folders/senders from AI. | M |
| FR-SET-04 | Local cache retention period (7 / 30 / 90 days; default 30) and "Clear cache". | M |
| FR-SET-05 | User profile for drafting: name, role/title, preferred sign-off, signature, writing style notes, language. | M |
| FR-SET-06 | Light/dark/system theme; text scaling honored. | M |
| FR-SET-07 | Export diagnostics log (redacted, no content, no secrets) for support. | S |
| FR-SET-08 | Sending settings: undo delay, require biometrics to send, block send while placeholders remain (default on), warn on external recipients (default on). | M |
| FR-SET-09 | Background settings: check interval, AI processing in background (on / Wi-Fi only / off), notification rules, plus a status panel showing the last successful background check per account. | M |

### 6.9 Background Mail Checking (FR-BG)

No Sentinel server in v1, so the app uses the OS background schedulers, like other non-push mail apps. What users can expect:

| Platform | Mechanism | Realistic behavior |
|---|---|---|
| Android | WorkManager periodic work (minimum interval **15 min**), constraints: network available | Runs about every 15–60 min (user setting). Delayed by Doze, App Standby buckets, battery saver and some OEM battery managers; resumes on next window. |
| iOS | `BGAppRefreshTask` (+ `BGProcessingTask` for heavier work) | **iOS decides** when and how often, based on how the user uses the app, battery and network: anywhere from several times an hour to a few times a day. Does not run if the user force-quits the app, turns off Background App Refresh, or is in Low Power Mode. Each run has about 30 s. |
| Both | On app open / resume, pull-to-refresh | Always syncs immediately. |

Near-real-time delivery on iOS (like the Gmail or Outlook apps) requires a push server; that is a later option (see OQ-2) and the design keeps room for it.

| ID | Requirement | Pri |
|---|---|---|
| FR-BG-01 | Register periodic background checks for new mail on all connected accounts. Android interval user-selectable: 15 / 30 / 60 min (default 15). iOS: request refresh at the earliest every 15 min; the OS decides. | M |
| FR-BG-02 | A background check runs incremental sync (headers + bodies of new mail), then triage of new mail if AI processing in background is allowed and the daily cap isn't reached; otherwise mail is queued for triage on next open. | M |
| FR-BG-03 | **Notifications for new mail** by rule: (a) P1 / VIP only (default), (b) all "Needs reply", (c) every new mail, (d) none. Per-account mute and quiet hours. Notification text hides content unless "Show previews" is on. Notifications group per account. | M |
| FR-BG-04 | Notification actions are limited to **Open** and **Mark action done**. No reply/send actions from notifications (FR-SND-08). | M |
| FR-BG-05 | Respect battery saver, Low Power Mode, data saver; option "AI processing on Wi-Fi only". | M |
| FR-BG-06 | Background work is time-boxed: on iOS stop cleanly before the OS deadline and save progress; jobs are idempotent and resume from the last cursor. | M |
| FR-BG-07 | Settings explain platform limits and show diagnostics: last background check per account, last error, whether Background App Refresh / notifications / battery optimization exemptions are on, with shortcuts to the OS settings. | S |
| FR-BG-08 | Android: optional "Check more reliably" toggle that asks the user to exempt Sentinel from battery optimization (explained, never required). | S |
| FR-BG-09 | Android: optional **real-time mode** for IMAP accounts using IMAP IDLE in a foreground service with a persistent notification. Only if it passes Google Play's foreground-service policy review; otherwise not shipped. | C |
| FR-BG-10 | Background code never sends email, never saves drafts to the server, and never shows AI drafts as notifications. It may pre-generate suggested replies **locally** for "Needs reply" mail if the user enables it (default off, cost warning). | M |

---

## 7. Non-Functional Requirements

### 7.1 Security (NFR-SEC)

| ID | Requirement |
|---|---|
| NFR-SEC-01 | Secrets (OAuth refresh tokens, IMAP/SMTP passwords, AI API keys, DB encryption key) are stored only via iOS Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) and Android Keystore-backed encrypted storage. Not in plain preferences, files, logs, crash reports or backups. |
| NFR-SEC-02 | Local database is encrypted at rest (SQLCipher, AES-256) with a random key held in secure storage. |
| NFR-SEC-03 | All network traffic uses TLS 1.2+; no cleartext traffic allowed (Android Network Security Config, iOS ATS). |
| NFR-SEC-04 | OAuth uses Authorization Code + PKCE (S256) with the system browser / OS auth session; no embedded WebViews for sign-in. |
| NFR-SEC-05 | Access tokens are kept in memory only; refresh tokens in secure storage. |
| NFR-SEC-06 | Email HTML is rendered sanitized, scripts disabled, remote content blocked by default. |
| NFR-SEC-07 | Prompt-injection resistance: email content is passed as delimited, untrusted data; the AI has **no tools** and cannot trigger any action; output is schema-validated; drafts always require user review, and sending requires a confirmed user action through the send gate. |
| NFR-SEC-10 | The send gate (FR-SND-03) is covered by automated architecture checks and tests in CI: send code is reachable only from the confirmation flow; background and AI code cannot import it. |
| NFR-SEC-08 | OWASP MASVS L2 controls are the security baseline; external penetration test before GA. |
| NFR-SEC-09 | Logs never contain email content, secrets or tokens; crash reporting (if enabled, opt-in) scrubs PII. |

### 7.2 Privacy & Compliance (NFR-PRV)

| ID | Requirement |
|---|---|
| NFR-PRV-01 | Data minimization: only the content needed for a task is sent to the AI; quoted history and signatures are stripped; length capped. |
| NFR-PRV-02 | Transparent disclosure (in-app and in the privacy policy) that email content is sent to the user's selected AI provider under that provider's terms. |
| NFR-PRV-03 | Comply with the **Google API Services User Data Policy** including **Limited Use** requirements; no use of Gmail data for advertising or to train generalized AI models. |
| NFR-PRV-04 | Comply with GDPR/UK GDPR & CCPA/CPRA principles: consent, access, deletion (local wipe), purpose limitation. |
| NFR-PRV-05 | Accurate **Apple App Privacy** labels and **Google Play Data safety** form. |
| NFR-PRV-06 | Product analytics (if any) are opt-in, anonymous, and contain no email content or addresses. |

### 7.3 Performance (NFR-PERF)

| ID | Requirement |
|---|---|
| NFR-PERF-01 | Cold start to cached inbox ≤ 2.5 s on a mid-range device (e.g. Pixel 6a / iPhone 12). |
| NFR-PERF-02 | Incremental sync of 50 new headers ≤ 5 s on 4G. |
| NFR-PERF-03 | Triage of 50 emails completes ≤ 60 s with a typical cloud AI provider (batched, parallel with bounded concurrency). |
| NFR-PERF-04 | Draft generation shows streaming output with first tokens ≤ 3 s where the provider supports streaming. |
| NFR-PERF-05 | UI stays at 60 fps while scrolling lists of 1,000 cached items. |
| NFR-PERF-06 | Background work honors OS limits and battery saver; no wake locks beyond OS-scheduled windows. |

### 7.4 Reliability (NFR-REL)

| ID | Requirement |
|---|---|
| NFR-REL-01 | Offline mode: cached mail, summaries, briefs and drafts-in-progress remain viewable offline; AI actions queue until connectivity returns. |
| NFR-REL-02 | Retries with exponential backoff and jitter for 429/5xx from email and AI providers; honor `Retry-After`. |
| NFR-REL-03 | AI output that fails schema validation is retried once with a repair prompt, then marked "Unclassified" without blocking the rest of the batch. |
| NFR-REL-04 | Draft save is idempotent (no duplicate drafts on retry). Send is never retried automatically; an uncertain send is reconciled against the Sent folder before the user can retry. |
| NFR-REL-05 | Crash-free sessions ≥ 99.5%. |

### 7.5 Usability & Accessibility (NFR-UX)

| ID | Requirement |
|---|---|
| NFR-UX-01 | WCAG 2.2 AA: contrast, screen reader labels (TalkBack/VoiceOver), dynamic type up to 200%, touch targets ≥ 48 dp / 44 pt. |
| NFR-UX-02 | AI-generated content is visually marked (e.g. ✨ "AI summary") and never presented as the sender's own words. |
| NFR-UX-03 | Localization-ready (ARB files); v1 ships English. Drafts may be generated in the language of the incoming email. |
| NFR-UX-04 | Every destructive or outbound action (send, save draft to server, remove account, wipe) has explicit confirmation or undo; send has both. |

### 7.6 Maintainability (NFR-MNT)

| ID | Requirement |
|---|---|
| NFR-MNT-01 | Layered architecture with provider adapters behind interfaces so new email/AI providers can be added without touching features. |
| NFR-MNT-02 | Unit test coverage ≥ 80% on domain & data layers; integration tests for each provider adapter against fakes. |
| NFR-MNT-03 | CI: format, analyze (zero warnings), test, the send-gate architecture check, and builds for both platforms on every PR. |

---

## 8. Key User Journeys

1. **First launch → first brief (target < 5 min):** Welcome → privacy & "you approve every send" explainer → connect Microsoft 365 (system browser, MFA via Authenticator) → add Claude API key (validated) → consent to AI processing → initial sync (last 7 days) → triage runs with progress → first Daily Brief.
2. **Morning routine:** Notification "Your brief is ready" → open (biometric unlock) → read headline → tap P1 item → read AI summary → "Draft reply" → choose "Accept" + Friendly → edit, fill `[confirm time]` → **Send** → confirmation sheet (recipients, final text, no warnings) → "Send now" → 5 s undo bar → sent; thread shows the reply.
3. **Action item follow-up:** Action Items tab → overdue "Send Q3 numbers to Alex (due today)" → open email → draft → "Save draft" (needs an attachment, so the user finishes in Outlook) → mark action done.
4. **Correcting the AI:** Newsletter wrongly marked Important → long-press → "Not important" + "Always for this sender" → future mail from sender is Low and skipped by AI.
5. **Reconnect:** M365 password changed → "Reconnect" banner → OAuth flow → sync resumes; no data lost.
6. **Background alert:** Phone in pocket → background check finds a VIP email → triaged as P1 → notification "Important email from Alex" (no preview) → tap → app lock → email detail. No reply is possible from the notification itself.
7. **Switching models:** Settings → AI → Tasks → Triage → pick another provider/model → "Test" on sample email → compare tokens/latency → save; the next background check uses it.

---

## 9. Business Rules

| ID | Rule |
|---|---|
| BR-01 | Sentinel sends email **only** when the user explicitly taps Send on a reviewed reply and confirms it (FR-SND-01..04). AI output, background jobs, notifications and retries never send. Sentinel never forwards, deletes or moves email in v1. Server-side writes are limited to: creating/updating/deleting drafts Sentinel created, and user-confirmed sends (including storing the sent copy and removing the sent draft). |
| BR-02 | No email content is sent to any AI provider before the user has given AI consent for that provider. |
| BR-03 | Mail classified `Security/Account`, and mail from muted senders or excluded accounts/folders, is never sent to the AI. |
| BR-04 | VIP sender → importance ≥ High. User correction for a sender overrides AI for that sender. |
| BR-05 | Priority matrix: High+Urgent = P1; High+Not urgent or Medium+Urgent = P2; Medium+Not urgent or Low+Urgent = P3; Low+Not urgent = P4. |
| BR-06 | If the daily token/cost cap is reached, AI processing pauses until the next local day or until the user raises the cap; non-AI features keep working. |
| BR-07 | Drafts never add recipients who were not on the original thread; the user may add them manually, and the confirmation sheet flags them. |
| BR-08 | What is sent is exactly what the user confirmed: any change after confirmation voids the send authorization and requires confirming again. |
| BR-09 | Each AI task uses the provider and model the user selected for it; if none, the global default. Email content is sent only to providers the user has consented to. |

---

## 10. Data Requirements (business view)

| Data | Where stored | Retention |
|---|---|---|
| OAuth refresh tokens, passwords, API keys | Secure storage (Keychain / Keystore) | Until account/provider removed or app wiped |
| Message headers & bodies (cache) | Encrypted local DB | User setting (default 30 days) |
| AI results (summaries, labels, action items) | Encrypted local DB | Same as message |
| Daily briefs | Encrypted local DB | Default 30 days |
| Drafts | User's mailbox (server) + local reference and unsaved edits | Server: until user sends/deletes; local ref: 30 days |
| Sent replies | User's mailbox (Sent folder, server) | Per the user's mailbox |
| Sent log (metadata + content hash, no body) | Encrypted local DB | 90 days |
| User corrections, VIP/mute lists, settings | Encrypted local DB | Until wiped |
| Usage counters | Local DB | 90 days |

No email data is stored on Sentinel-operated servers.

---

## 11. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Google restricted-scope verification / CASA assessment delays launch | High | High | Start verification at Sprint 1; budget for the assessment; ship M365 + IMAP first if needed (Gmail via IMAP + app password as interim) |
| R-2 | Enterprise tenants block the app (admin consent / Conditional Access) | Medium | Medium | Publisher verification; clear admin-consent docs & error messages; least-privilege delegated permissions |
| R-3 | Prompt injection in emails manipulates summaries/drafts | Medium | Medium | No tools, strict schemas, delimiting, user review of every draft, placeholder highlighting, "AI can be wrong" UI |
| R-4 | AI hallucination (fake facts/commitments in drafts) | Medium | High | Placeholders for unknowns, intent selection, mandatory review before send, send confirmation |
| R-5 | API cost surprises for users | Medium | Medium | Pre-filtering, trimming, batching, usage dashboard, hard caps |
| R-6 | iOS background limits make background checks and scheduled briefs irregular | High | Medium | Generate/sync on open; explain limits in settings; diagnostics panel; push server as a later option |
| R-7 | Credential leakage via backups/logs | Low | Critical | ThisDeviceOnly keychain class, Android backup exclusion, log scrubbing, pen test |
| R-8 | An email is sent without the user's intent (bug, injected instruction, accidental tap) | Low | Critical | Send gate with content-bound, single-use authorization; confirmation sheet + undo window; no send code reachable from AI/background (CI architecture checks + tests); no auto-retry; optional biometric-to-send |
| R-10 | Android OEM battery managers kill background work | Medium | Medium | WorkManager best practices; optional battery-optimization exemption (FR-BG-08); diagnostics |
| R-11 | Users pick models that perform poorly on triage | Medium | Medium | Model "Test" button, suggested models, schema validation + repair, per-task switching |
| R-9 | Third-party Flutter packages abandoned/vulnerable | Medium | Medium | Prefer well-maintained packages, wrap behind adapters, dependency scanning |

---

## 12. Release Plan (high level)

| Milestone | Content | Indicative timing |
|---|---|---|
| M0 — Foundations | Project setup, CI, architecture, secure storage, DB, design system | Sprints 0–1 |
| M1 — Alpha | IMAP + M365, Claude + OpenAI + compatible, triage, inbox segments | Sprints 2–5 |
| M2 — Beta | Gmail, drafts and human-approved send (all providers), background checking & notifications, daily brief, action items, AI task routing, settings, usage caps; closed beta (TestFlight / Play internal testing) | Sprints 6–9 |
| M3 — GA | Hardening, pen test, accessibility audit, store submissions, Google verification complete | Sprints 10–12 |

Sprints are 2 weeks. See `docs/handoff/backlog.md` for the detailed backlog.

---

## 13. Acceptance Criteria (Release-level)

1. All **Must** requirements are implemented and pass their acceptance tests.
2. Send-gate checks pass in CI, and a manual audit (traffic capture) confirms mail is delivered only after a confirmed user action, never from background, AI, or notification flows.
3. External pen test: no Critical/High findings open.
4. Accessibility audit: no WCAG 2.2 AA blockers.
5. Google OAuth verification (incl. CASA) and Microsoft publisher verification complete, or Gmail feature-flagged off.
6. Store listings, privacy policy, App Privacy labels and Data safety form approved.

---

## 14. Open Questions

| ID | Question | Proposed default |
|---|---|---|
| OQ-1 | ~~Should a later version allow user-initiated send?~~ | **Resolved (v1.1):** yes, in v1 — human-initiated send behind the send gate (§6.4). |
| OQ-2 | ~~Do we need a back-end for push notifications?~~ | **Resolved (v1.1):** no server for now; OS background scheduling (§6.9). A push relay (Gmail Pub/Sub, Graph change notifications, APNs/FCM) remains a future option for real-time on iOS. |
| OQ-6 | Should new emails (not replies) and forwarding be added in v1.1 using the same send gate? | Yes, v1.1 candidate. |
| OQ-7 | Attachments on replies (pick a file from the device)? | v1.1 candidate; in v1 users finish such replies in their mail client. |
| OQ-3 | Monetization (free / one-time / subscription for advanced features)? | TBD by business; architecture keeps feature flags ready. |
| OQ-4 | Support on-device models (e.g. platform on-device LLMs) for full privacy mode? | Investigate for v1.x; provider interface already allows it. |
| OQ-5 | Mark-as-read / archive actions (server write beyond drafts)? | v1.1 behind a setting. |

---

## 15. Glossary

| Term | Meaning |
|---|---|
| BYOK | Bring Your Own Key — the user supplies the AI API key |
| PKCE | Proof Key for Code Exchange — OAuth extension protecting mobile auth codes |
| MFA | Multi-Factor Authentication |
| CASA | Cloud Application Security Assessment — Google-required security assessment for restricted scopes |
| Graph | Microsoft Graph API |
| Brief | The daily AI summary |
| Triage | Classification of mail by importance, urgency, priority, category and actions |

---

## 16. Approvals

| Role | Name | Signature | Date |
|---|---|---|---|
| Product Owner | | | |
| Engineering Lead | | | |
| Security & Privacy | | | |
| Legal | | | |
