# WITM — Browns Sales Tracker

A lightweight web app for tracking your sales at Browns: log each sale's date, amount, and commission, and see running totals and a monthly commission trend.

## Features

- Add, edit, and delete sales (date, item, amount, commission % or $)
- Auto-calculates commission from a default or per-sale rate
- Summary cards: total sales, total commission, count, average sale
- Filter by All Time / Today / This Week / This Month / This Year
- Monthly commission bar chart
- Export your sales history to CSV
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
