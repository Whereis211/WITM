# WITM — Browns Sales Tracker

A web app for tracking your sales at Browns: log a running sales total (and hours worked) per day, track progress against a weekly sales goal, and see your commission, wages, records, and forecast — all rolled up into daily, weekly, monthly, and yearly views.

## Commission model

- You have a **weekly commission threshold** (default $9,350).
- Once a week's sales exceed the threshold, you earn a **commission rate** (default 4%) on the amount *over* it.
- Example: $10,000 in sales in a week, $9,350 threshold → 4% × $650 over = **$26** commission that week.
- Monthly and yearly commission totals are the sum of the weekly commissions falling in that month/year (a week is attributed to the month/year its Monday falls in).
- This is separate from the **weekly sales goal** (default $20,000, see below) — the goal drives the dashboard, streaks, and records; the threshold drives commission.
- The threshold, rate, goal, hourly wage, and monthly/yearly targets are all configurable in Settings.

## Features

- **Daily entry**: log one running sales total and hours worked per day — re-entering a date you've already logged updates it instead of creating a duplicate
- **Weekly Goal dashboard**: current sales vs. your $20,000 goal, remaining, % of goal, days left in the week, required sales/day to hit it, and an On Pace / Behind Pace / Goal Hit status
- **Commission & Earnings**: this week's threshold, amount over threshold, commission, hours worked, base wages (hours × hourly wage), and gross earnings
- **Goal Simulator**: enter a hypothetical additional sale to see the updated week total, remaining target, required daily average, and estimated commission — without saving anything
- **Daily / Weekly / Monthly / Yearly breakdown** table and chart, with a Sales/Commission toggle and a goal reference line on the weekly sales chart
- **Records & Streaks**: best day, best week, average week, count of $20K weeks, highest sales/hour, current and longest $20K streaks, and progress toward independently-configurable monthly and yearly targets
- **Sales Forecast**: projected weekly/monthly/yearly sales and commission, based on your trailing 4-week average
- **AI Sales Coach**: on-demand analysis (Performance Summary, Goal Analysis, Next Shift Plan, Trend Analysis, Actionable Advice, and a Weekly Review once you have a completed week) generated from your real numbers — see below
- Export your daily totals (including hours) to CSV
- Data is saved locally in your browser by default, with **optional cross-device sync** (see below)

## Running it

No build step required for the frontend. Either:

- Open `index.html` directly in a browser, or
- Serve the folder locally, e.g.:

  ```bash
  python3 -m http.server 8000
  ```

  then visit `http://localhost:8000`.

The `/api/data` sync endpoint only works when deployed on Vercel (see below) — it's a serverless function, not a static file.

## Deploying (permanent URL)

This repo is connected to a Vercel project, which auto-deploys every push:

- Every branch/PR gets its own preview URL (posted as a comment by the Vercel GitHub App).
- Pushes to `main` deploy to the project's **production** URL — check your Vercel dashboard (vercel.com → your team → the `witm` project → Domains) for the exact address.

No extra setup is needed for the permanent URL — it already exists as long as the Vercel project stays connected to this GitHub repo.

## Cross-device sync (optional)

By default, data lives only in the browser you're using (`localStorage`) — nothing syncs anywhere. To make the same data show up on your phone and your laptop, wire up the included sync API:

1. **Add a Redis-backed store to the Vercel project**: in the Vercel dashboard, go to the project → **Storage** → **Create Database** → pick an Upstash/KV-style Redis store, and connect it to the project. This automatically adds `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) environment variables — either naming works with `api/data.js`.
2. **Set a passcode**: in the project's **Settings → Environment Variables**, add `APP_PASSCODE` set to any password you choose. This is the shared secret that protects your data — nobody without it can read or write your sales data through the API. Redeploy (or push again) so the new env vars take effect.
3. **Connect the app**: open Settings in the app, scroll to "Sync Across Devices," enter that same passcode, and click **Connect & Sync**. Do the same on any other device to share the data.

Without steps 1–2 done on the server, the app works exactly as before (local-only) — entering a passcode with no server-side sync configured just shows a sync error and leaves your local data untouched.

**Known limitations**: sync is last-write-wins (no merge of concurrent edits from two devices), and the passcode is a simple shared secret, not a full authentication system — fine for a personal tracker, not for anything sensitive.

## AI Sales Coach (optional)

Click **Analyze My Performance** to get a fresh, data-grounded read on how you're doing, generated by Claude. The app computes every number itself first (goal pace, remaining, required sales/day, week-over-week trend, records, forecast) using the exact same math as the rest of the dashboard, and sends only those already-computed figures to the model — the AI narrates and advises, it never does its own arithmetic, so it can't invent a dollar figure.

**Setup**: in the Vercel project's **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` with a key from your [Anthropic Console](https://console.anthropic.com/). Redeploy (or push again) so it takes effect. Without this key set, clicking Analyze shows a clear "not configured yet" message rather than failing silently — the rest of the app is unaffected.

**What gets sent to the AI**: only aggregated sales figures — dollar amounts, dates, hours, percentages, and streak counts. Never your name, passcode, or any device/browser information. The request is handled by a server-side route (`api/coach.js`); the API key never reaches the browser.

**Cost note**: this calls a paid API (Claude) on every click of "Analyze My Performance." Since the app has no login, anyone who has your deployed URL could trigger analyses and consume your API credits. This app doesn't gate the endpoint beyond requiring `ANTHROPIC_API_KEY` to be set — if you want it locked down further (e.g. behind the same sync passcode), that's a small follow-up change.

## Notes

- Local data is stored in your browser's `localStorage`, scoped to the origin you open the app from. Even with sync enabled, each device keeps a local copy for offline use. Use the **Export CSV** button any time to back up your data.
