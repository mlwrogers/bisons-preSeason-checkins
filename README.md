# Bisons Summer Training Check-In

A simple mobile-friendly app for Birmingham Bisons players to check off their summer training sessions, track streaks, and see a team leaderboard.

**Live app:** add your GitHub Pages URL here once deployed.

## How it works
- Players join with their name, team, and a 4-digit PIN (no accounts, no passwords elsewhere)
- Tap a session to see the full breakdown (warm-up, drills, circuit, cool down), then mark it complete
- Points for showing up, keeping a streak, and full-squad weeks
- Leaderboard by team or combined

## Stack
- Single-file front end (`index.html`) — no build step
- Google Sheets as the database, via an Apps Script backend (`apps-script.gs`)
- Hosted free on GitHub Pages

## Setup
1. Set up the Google Sheet + Apps Script backend — see the comments at the top of `apps-script.gs` (Sheet tab structure, deployment, security model).
2. Put your deployed Web App URL and a shared `APP_TOKEN` in `config.js` (the token must match the one in `apps-script.gs`).

## Data & trust
All check-ins are self-reported, no photo evidence required. Anyone with the app link can join and log sessions — this is a low-stakes club tool, not a secured system.
