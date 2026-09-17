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
- Export your daily totals (including hours) to CSV
- Data is saved locally in your browser (no server, no account needed)

## Running it

No build step or dependencies required. Either:

- Open `index.html` directly in a browser, or
- Serve the folder locally, e.g.:

  ```bash
  python3 -m http.server 8000
  ```

  then visit `http://localhost:8000`.

## Notes

- Data is stored in your browser's `localStorage`, scoped to the origin you open the app from. It will persist between visits on the same browser/device, but won't sync across devices — use the **Export CSV** button to back up or move your data.
