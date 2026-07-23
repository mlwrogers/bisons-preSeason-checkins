# Project: Bisons Summer Training Check-In — Handoff Context

## What this is
A free, mobile-first web app for Birmingham Bisons Handball Club players (all ages, U14 through adult) to check off their summer preseason training sessions, track streaks/points, and see a team leaderboard. Built for Matt's son Seb's club. Low-stakes, trust-based (no photo evidence, no real auth).

## Status
Built and functionally deployed. Web app URL is wired up. Now needs a **hardening and security review pass**, plus real-world testing, before being shared with the full squad.

## Stack
- **Front end:** single self-contained `index.html` (vanilla JS, no framework, no build step). Tailwind loaded via CDN (`cdn.tailwindcss.com` — known dev-only warning in console, intentionally left as-is per Matt's call, revisit in hardening pass if desired).
- **Backend/DB:** Google Sheets, via a Google Apps Script Web App (`apps-script.gs`) deployed with "Execute as: Me / Access: Anyone".
- **Hosting:** GitHub Pages (public repo).

## Files (should be in the repo)
- `index.html` (was `index-sheets.html` locally, renamed for GitHub Pages to auto-serve at root)
- `apps-script.gs` — paste into the Sheet's Extensions > Apps Script editor
- `README.md` — short repo-facing readme
- `.gitignore` — macOS/editor hidden files

## Data model
Two Google Sheet tabs:
- `Players`: `id | key | name | team | pin` — key = `name.toLowerCase()+'|'+team`. The `pin` column holds a **salted SHA-256 hash**, never the plaintext PIN (hardening pass). Don't hand-edit it. **To reset a player's PIN: clear their `pin` cell**; the next PIN they type on login becomes their new one and their check-ins/points are preserved.
- `Checkins`: `playerId | sessionId | timestamp`

Apps Script actions (all via GET with query params, not POST — required because Apps Script Web App redirects break POST bodies from browser `fetch`):
- `action=getState` → `{players, checkins}`
- `action=login&name=&team=&pin=` → creates player on first use, else validates PIN
- `action=checkin&playerId=&sessionId=`
- `action=uncheck&playerId=&sessionId=` (undo)

## Config values
- `config.js` — holds `WEB_APP_URL` and `APP_TOKEN` (loaded by index.html before the app script). This is the only file you edit to point at a backend. It is **public** (ships to the browser) — not a secret store.
- `APP_TOKEN` — a shared string sent on every request and checked server-side. Purely a noise filter to keep random scanners off the endpoint / Apps Script quota; **not real auth** (it's in the public repo). Must match `APP_TOKEN` in `apps-script.gs`.
- `TEAMS` — `["Adult Men", "Adult Women", "U16 Boys & Girls", "U14 Boys & Girls"]`
- `SESSIONS` — hardcoded array of 9 sessions transcribed from the coach's poster (Bisons Summer Training Programme), each with warm-up/main-work/circuit/cooldown blocks, sets/reps/rest, dateLabel strings (set to Aug/Sept 2026), intensity type (`high`/`moderate`/`low` → red/navy/green, matching the poster's own colour key)
- `INACTIVITY_TIMEOUT_MS` — 10 minutes; player is logged back to PIN screen after this idle, which forces a fresh data pull. No background polling — refresh only happens on login, own check-in/uncheck, manual refresh button, or after inactivity timeout. This was a deliberate choice to keep Apps Script request volume low.

## Points system
- 10 pts per session completed
- +2 pts per session for an active streak (consecutive sessions in programme order, num 1–9; a gap resets it)
- +5 pts to everyone on a team for any session the whole registered team completes
- +5 pts to a player for completing both sessions in a given week

## Design language
Birmingham Bisons branding: navy (#0F1E3D) header/primary, red (#C8102E) for high-intensity/primary accents, green (#2F7A4C) for low-intensity, gold (#D9A441) for points. Fonts: Big Shoulders Display (headings), Karla (body), IBM Plex Mono (numbers). A "goal arc" SVG (semi-circle, echoing a handball 6m line) is used as the streak progress meter — the one deliberate signature visual element.

## Hardening pass — done (2026-07-23)
- **PINs no longer exposed:** `getState` returns a PIN-free player projection. Previously it leaked every plaintext PIN to any caller of the public URL.
- **PINs hashed:** stored as `SHA-256(pepper + playerId + pin)`. Pepper lives in Apps Script **Script Properties** (server-side only, auto-generated first run) — not in the sheet, not in the repo — so a Sheet reader can't recover PINs.
- **Mutations authenticated:** `checkin`/`uncheck` now require the player's PIN (client sends the plaintext PIN it holds in memory; server re-hashes + compares). Closes the "anyone with a public playerId can edit anyone's check-ins" hole.
- **Stored XSS fixed:** all user-controlled strings (names, teams) are HTML-escaped via `esc()` before hitting innerHTML.
- **Input validation:** server rejects non-allowlist teams, strips control chars + caps name length, validates sessionId; generic error messages (no internal detail leak).
- **APP_TOKEN scanner filter:** shared token checked server-side. Noise reduction only, not auth (see Config values).
- **Reliability:** front-end requests now have a 12s timeout + a Retry banner instead of hanging on "Loading…" forever if the backend is slow/down.
- **A11y:** removed `maximum-scale=1` so users can pinch-zoom.
- **PIN reset flow:** clear a player's `pin` cell → next login PIN they type becomes the new one (points preserved). Replaces the old "no self-service recovery" gap.

## Still open / deliberately not done
- Apps Script is still "Anyone" access with a public URL — this is inherent to the hosting model and is now *safe by design* (endpoints hardened, no secrets in responses), not an outstanding hole.
- No true rate limiting (Apps Script gives no IP; APP_TOKEN only filters generic scanners).
- Tailwind CDN console warning (cosmetic, dev-only) — left as-is; could precompile a stylesheet if desired.
- No admin UI — reset is the manual Sheet-cell method above. A fuller admin/reset view is possible but scope creep for now.
- Concurrent multi-user check-in behavior not yet load-tested (LockService is in place but not battle-tested).

## Deploy note (IMPORTANT)
Editing `apps-script.gs` in the Apps Script editor is not enough — you must **create a new deployment version** (Deploy > Manage deployments > edit > New version) for the live Web App to pick up the hardened code. Until then the old backend (which ignores the token and still returns PINs) stays live.

## Preferences to carry forward
- Matt wants straight, no-fluff answers with alternative options where relevant, since he's not always sure he's right and wants pushback/alternatives offered.
- Matt is Director-level, technically fluent (GitHub, Confluence, VS Code, JS comfortable) — no need to over-explain basics.
