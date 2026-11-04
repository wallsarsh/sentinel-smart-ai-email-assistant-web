# Demo mail generator

`tools/generate-demo-mail.mjs` creates synthetic inbox traffic for a busy Head of IT at a non-profit: requests, meetings, invoices, vendor notices, security alerts, helpdesk updates, grant follow-ups, HR access reviews, newsletters, social notes and phishing reports. It generates realistic conversations with `Message-ID`, `In-Reply-To`, `References` and `Re:` subjects.

The content is synthetic. Do not send it or treat it as real mail.

## Generate files

```sh
npm run demo:mail -- --days 5
npm run demo:mail -- --weeks 2 --per-day 45
npm run demo:mail -- --months 1
npm run demo:mail -- --start 2026-10-01 --end 2026-10-31
```

Output goes to `demo-mail/` by default:

- `eml/` — one RFC 5322 `.eml` per message
- `sentinel-demo.mbox` — one mbox for import
- `manifest.json` — range, count, thread count, seed and persona

Options:

| Option | Meaning |
|---|---|
| `--days N` | Last N days ending today (default 3) |
| `--weeks N` | Last N weeks |
| `--months N` | Last N calendar months |
| `--start / --end` | Explicit inclusive range (`YYYY-MM-DD`) |
| `--per-day N` | Average weekday messages (default 35; weekends are quieter) |
| `--seed N` | Deterministic content (default `20261106`) |
| `--out DIR` | Output directory |
| `--apply` | Install into a Thunderbird Local Folders mailbox |
| `--folder NAME` | Mailbox name (default `Sentinel Demo`) |
| `--profile DIR` | Thunderbird profile; auto-detected otherwise |
| `--replace` | Replace the mailbox instead of appending |

## Store the mail in Thunderbird

Close Thunderbird, then run:

```sh
npm run demo:mail -- --days 5 --apply
```

The script finds the Thunderbird profile from `THUNDERBIRD_PROFILE`, `--profile`, `profiles.ini` or the usual Linux/macOS/Windows locations. It appends the mbox to:

```
<profile>/Mail/Local Folders/Sentinel Demo
```

and removes `Sentinel Demo.msf` so Thunderbird rebuilds the index. Start Thunderbird and open **Local Folders → Sentinel Demo**.

If auto-detection fails, pass the profile explicitly. If the profile is locked, the script stops, prints the exact lock file and asks you to close Thunderbird. On Windows, a crash can leave a stale `parent.lock`; close all Thunderbird processes, delete `parent.lock` (and `lock` if present) in the profile root, then retry. Never edit a profile while Thunderbird is running.

The generated `.eml` files can also be imported with Thunderbird’s import tools or any mbox-aware mail client.
