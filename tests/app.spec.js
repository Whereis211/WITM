// @ts-check
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("adding today's total updates the Today card and the daily breakdown", async ({ page }) => {
  await page.fill("#saleAmount", "500");
  await page.click("#saleForm button[type=submit]");

  await expect(page.locator("#sumTodayRevenue")).toHaveText("$500.00");
  await expect(page.locator("#breakdownBody tr")).toHaveCount(1);
  await expect(page.locator("#breakdownBody tr td").first()).toHaveText(
    new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  );
});

test("re-entering a total for an already-logged date overwrites it instead of duplicating", async ({ page }) => {
  await page.fill("#saleDate", "2026-01-05");
  await page.fill("#saleAmount", "100");
  await page.click("#saleForm button[type=submit]");

  await page.fill("#saleDate", "2026-01-05");
  await page.fill("#saleAmount", "250");
  await page.click("#saleForm button[type=submit]");

  await expect(page.locator("#breakdownBody tr")).toHaveCount(1);
  await expect(page.locator("#breakdownBody tr td[data-label='Sales Total']")).toHaveText("$250.00");
});

test("editing a daily total loads it back into the form, including hours", async ({ page }) => {
  await page.fill("#saleDate", "2026-01-05");
  await page.fill("#saleAmount", "300");
  await page.fill("#saleHours", "8");
  await page.click("#saleForm button[type=submit]");

  await page.click("#breakdownBody tr:first-child .btn-link-text");

  await expect(page.locator("#formTitle")).toHaveText("Edit Daily Total");
  await expect(page.locator("#saleDate")).toHaveValue("2026-01-05");
  await expect(page.locator("#saleAmount")).toHaveValue("300");
  await expect(page.locator("#saleHours")).toHaveValue("8");
});

test("weekly breakdown shows sales total and commission for a past week", async ({ page }) => {
  // Mon Jan 5 2026 - Fri Jan 9 2026, $2,000/day = $10,000 for the week.
  const days = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"];
  for (const d of days) {
    await page.fill("#saleDate", d);
    await page.fill("#saleAmount", "2000");
    await page.click("#saleForm button[type=submit]");
  }

  await page.click('.filter-btn[data-period="weekly"]');

  const row = page.locator("#breakdownBody tr").first();
  await expect(row.locator("td[data-label='Sales Total']")).toHaveText("$10,000.00");
  await expect(row.locator("td[data-label='Commission']")).toHaveText("$26.00");
  // $10,000 is under the $20,000 weekly goal, so it shouldn't count as a hit.
  await expect(row.locator("td[data-label='Goal']")).toHaveText("—");
});

test("a week clearing the $20,000 goal is marked hit and counted as a streak", async ({ page }) => {
  // Mon Feb 2 2026 - Fri Feb 6 2026, $4,500/day = $22,500 for the week.
  const days = ["2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05", "2026-02-06"];
  for (const d of days) {
    await page.fill("#saleDate", d);
    await page.fill("#saleAmount", "4500");
    await page.click("#saleForm button[type=submit]");
  }

  await page.click('.filter-btn[data-period="weekly"]');
  const row = page.locator("#breakdownBody tr").first();
  await expect(row.locator("td[data-label='Sales Total']")).toHaveText("$22,500.00");
  await expect(row.locator("td[data-label='Goal']")).toHaveText("✓ Hit");

  await expect(page.locator("#recGoalWeeksCount")).toHaveText("1");
  await expect(page.locator("#recCurrentStreak")).toHaveText("1 week");
  await expect(page.locator("#recLongestStreak")).toHaveText("1 week");
});

test("monthly and yearly breakdowns roll up the same week's commission", async ({ page }) => {
  const days = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"];
  for (const d of days) {
    await page.fill("#saleDate", d);
    await page.fill("#saleAmount", "2000");
    await page.click("#saleForm button[type=submit]");
  }

  await page.click('.filter-btn[data-period="monthly"]');
  let row = page.locator("#breakdownBody tr").first();
  await expect(row.locator("td[data-label='Sales Total']")).toHaveText("$10,000.00");
  await expect(row.locator("td[data-label='Commission']")).toHaveText("$26.00");

  await page.click('.filter-btn[data-period="yearly"]');
  row = page.locator("#breakdownBody tr").first();
  await expect(row.locator("td[data-label='Sales Total']")).toHaveText("$10,000.00");
  await expect(row.locator("td[data-label='Commission']")).toHaveText("$26.00");
});

test("this week's dashboard reflects hours, base wages, and gross earnings", async ({ page }) => {
  await page.fill("#saleAmount", "10000");
  await page.fill("#saleHours", "30");
  await page.click("#saleForm button[type=submit]");

  await expect(page.locator("#goalCurrent")).toHaveText("$10,000.00");
  await expect(page.locator("#goalRemaining")).toHaveText("$10,000.00");
  await expect(page.locator("#goalPct")).toHaveText("50.0%");

  await expect(page.locator("#earnQuota")).toHaveText("$9,350.00");
  await expect(page.locator("#earnOverQuota")).toHaveText("$650.00");
  await expect(page.locator("#earnCommission")).toHaveText("$26.00");
  await expect(page.locator("#earnHours")).toHaveText("30.0");
  await expect(page.locator("#earnBaseWages")).toHaveText("$547.50"); // 30 * $18.25
  await expect(page.locator("#earnGrossEarnings")).toHaveText("$573.50"); // 547.50 + 26.00
});

test("goal simulator computes a hypothetical outcome without saving a sale", async ({ page }) => {
  await page.fill("#simAmount", "25000");
  await page.click("#simBtn");

  await expect(page.locator("#simWeekTotal")).toHaveText("$25,000.00");
  await expect(page.locator("#simRemaining")).toHaveText("$0.00");
  await expect(page.locator("#simCommission")).toHaveText("$626.00"); // (25000-9350)*4%

  // Nothing was actually logged.
  await expect(page.locator("#breakdownBody tr")).toHaveCount(0);
  await expect(page.locator("#sumTodayRevenue")).toHaveText("$0.00");
});

test("sales forecast uses the trailing 4-week average", async ({ page }) => {
  const weeks = [
    ["2025-01-06", "10000"],
    ["2025-01-13", "12000"],
    ["2025-01-20", "14000"],
    ["2025-01-27", "16000"]
  ];
  for (const [d, amount] of weeks) {
    await page.fill("#saleDate", d);
    await page.fill("#saleAmount", amount);
    await page.click("#saleForm button[type=submit]");
  }

  // Average weekly = (10000+12000+14000+16000)/4 = 13000
  await expect(page.locator("#fcWeekly")).toHaveText("$13,000.00");
  await expect(page.locator("#fcMonthly")).toHaveText("$56,485.00"); // 13000 * 4.345
  await expect(page.locator("#fcYearly")).toHaveText("$676,000.00"); // 13000 * 52
  await expect(page.locator("#fcWeeklyCommission")).toHaveText("$146.00"); // (13000-9350)*4%
});

test("changing settings affects future commission, wages, and goal calculations", async ({ page }) => {
  await page.click("#settingsBtn");
  await page.fill("#weeklyGoal", "5000");
  await page.fill("#weeklyQuota", "1000");
  await page.fill("#commissionRate", "10");
  await page.fill("#hourlyWage", "20");
  await page.click("#saveSettingsBtn");

  await page.fill("#saleAmount", "1500");
  await page.fill("#saleHours", "10");
  await page.click("#saleForm button[type=submit]");

  await expect(page.locator("#goalCurrent")).toHaveText("$1,500.00");
  await expect(page.locator("#goalPct")).toHaveText("30.0%"); // 1500/5000
  await expect(page.locator("#earnQuota")).toHaveText("$1,000.00");
  await expect(page.locator("#earnOverQuota")).toHaveText("$500.00");
  await expect(page.locator("#earnCommission")).toHaveText("$50.00"); // 500 * 10%
  await expect(page.locator("#earnBaseWages")).toHaveText("$200.00"); // 10 * $20
  await expect(page.locator("#earnGrossEarnings")).toHaveText("$250.00");
});
