# Security review (OWASP ASVS L2 pass)

Run it: `npm run build && npm run e2e` (`tests/security/security.e2e.ts`, in the CI `e2e` job), plus
`node tools/audit.mjs` (dependencies) and `node tools/secrets-scan.mjs` (secrets), both in the CI `checks` job.
The route-wide tests enumerate `server/api`, so a new route is swept automatically.

## Outcome by area

| Area (ASVS) | Check | Result | Evidence |
| --- | --- | --- | --- |
| V14 headers | CSP: `default-src 'none'`, per-response nonce on every script, `strict-dynamic`, no `unsafe-inline`/`unsafe-eval` for scripts, no wildcards, `frame-ancestors 'none'`, `base-uri 'none'`, `object-src 'none'`, `form-action 'self'`, `connect-src 'self'`; no inline event handlers | pass | `security.e2e.ts` response headers |
| V14 headers | HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, Permissions-Policy, no `X-Powered-By`/`Server` | pass | same |
| V14 headers | API responses not cacheable | **fixed** (was missing; now `no-store` on every `/api` response) | `server/middleware/10-api-headers.ts` |
| V3 sessions | Session cookie HttpOnly, SameSite=Lax, path `/`, bounded lifetime, Secure in production; CSRF cookie SameSite=Strict | pass (Secure verified at unit level: the e2e server runs over http) | cookies tests, `sessions.ts` |
| V3 sessions | Revoked session stops working immediately; password change ends other sessions | pass | T142 tests, `flows.e2e.ts` |
| V4 access control | Every route except a listed public set refuses requests without a session (401) | pass | `authentication on every route` |
| V4 access control | Two users: every route taking an id refuses the other user's ids; lists show only own data; nothing of A's changed by B | pass | `authorization` |
| V13 / CSRF | Every POST/PUT/PATCH/DELETE refuses: missing header, foreign Origin, forged token | pass | `CSRF on every mutating route` |
| V12/V5 SSRF | AI provider URLs: loopback, link-local/metadata, private ranges, IPv6 loopback, `file:`, userinfo refused | pass | `SSRF` tests; DNS-rebinding and redirect handling in `tests/unit/safe-fetch` |
| V5 XSS | Hostile HTML in sender, subject and body never runs script in the app or in the sandboxed frame (real Chromium) | pass | `XSS in the browser`, `tests/browser`, 12-email hostile corpus |
| V7 errors | Malformed/oversized bodies and unknown routes: no stack, path or framework detail; unknown `/api` paths are JSON 404 | **fixed** (unknown `/api` paths used to fall through to the app and answer with its HTML/redirect) | `server/api/[...path].ts` |
| V2 authentication | Login throttling, lockout, step-up for sensitive actions, MFA enrolment cannot be restarted while on | pass; **fixed** earlier (T142): restarting enrolment could switch MFA off without a code | `auth`, `mfa`, `security-settings` tests |
| V2 / availability | Auth rate limit counted the reads the route guard makes on every page load, so reloading could sign a user out by 429 | **fixed** (T150): only secret-checking endpoints use the strict limit | `rate-limit.ts` |
| V13 CSRF | Page code never sent the CSRF header, so every browser POST was refused | **fixed** (T150) | `app/plugins/csrf.client.ts`, `flows.e2e.ts` |
| V14 dependencies | `npm audit` high/critical | **fixed**: nodemailer 7.0.13 (SMTP command injection, header CRLF injection) upgraded to 10.2.1; send tests pass | `tools/audit.mjs` |
| V14 secrets | Tracked files scanned for keys, tokens, private keys, `.env` | pass | `tools/secrets-scan.mjs` + test |
| V8 data | Message bodies/secrets in logs, metrics, reports, caches | pass: logger field allow-list; metrics labels bounded; error reports scrubbed; offline cache holds no mail text | T033, T143, T154 tests |

## Accepted risks and gaps

- `style-src 'unsafe-inline'` remains because Tailwind and Vue emit inline styles. Scripts are nonce-only, so this does not allow script execution.
- HSTS is sent but only takes effect over HTTPS; the e2e server runs over HTTP. Secure cookies are proven by unit test, not in a browser over TLS.
- Moderate advisories remain in dev tooling (`drizzle-kit`/`esbuild` dev server) and Nuxt (`<=4.6.1`, route-rule and `<NuxtLink>` issues with fixes available in a newer Nuxt). They are below the CI threshold; track the Nuxt upgrade.
- This is an automated checklist pass, not a penetration test or a full ASVS audit. Not covered: TLS configuration and reverse-proxy headers (deployment, T156), KEK rotation procedure (T158), real provider OAuth flows (T160), social-engineering and physical threats.
