# WITM — Browns Sales Tracker

A lightweight web app for tracking your sales at Browns: log a running sales total per day, and see it rolled up into daily, weekly, monthly, and yearly totals — with commission calculated against a weekly quota.

## Commission model

- You have a **weekly quota** (default $9,350).
- Once a week's sales exceed the quota, you earn a **commission rate** (default 4%) on the amount *over* quota.
- Example: $10,000 in sales in a week, $9,350 quota → 4% × $650 over = **$26** commission that week.
- Monthly and yearly commission totals are the sum of the weekly commissions falling in that month/year (a week is attributed to the month/year its Monday falls in).
- Both the quota and rate are configurable in Settings.

## Features

- Log one running sales total per day — re-entering a date you've already logged updates it instead of creating a duplicate, so you can just re-enter your running total as the day goes
- Summary cards for Today, This Week (with quota progress bar), This Month, and This Year
- Daily / Weekly / Monthly / Yearly breakdown table and chart
- Export your daily totals to CSV
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
