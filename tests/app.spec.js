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

test("editing a daily total loads it back into the form", async ({ page }) => {
  await page.fill("#saleDate", "2026-01-05");
  await page.fill("#saleAmount", "300");
  await page.click("#saleForm button[type=submit]");

  await page.click("#breakdownBody tr:first-child .btn-link-text");

  await expect(page.locator("#formTitle")).toHaveText("Edit Daily Total");
  await expect(page.locator("#saleDate")).toHaveValue("2026-01-05");
  await expect(page.locator("#saleAmount")).toHaveValue("300");
});

test("weekly commission is 4% of sales over the $9,350 quota", async ({ page }) => {
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
  await expect(row.locator("td[data-label='Quota']")).toHaveText("$9,350.00");
  await expect(row.locator("td[data-label='Over Quota']")).toHaveText("$650.00");
  await expect(row.locator("td[data-label='Commission']")).toHaveText("$26.00");
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

test("a week under quota earns no commission", async ({ page }) => {
  await page.fill("#saleDate", "2026-01-05");
  await page.fill("#saleAmount", "1000");
  await page.click("#saleForm button[type=submit]");

  await page.click('.filter-btn[data-period="weekly"]');
  const row = page.locator("#breakdownBody tr").first();
  await expect(row.locator("td[data-label='Over Quota']")).toHaveText("$0.00");
  await expect(row.locator("td[data-label='Commission']")).toHaveText("$0.00");
});

test("changing the weekly quota and commission rate in settings affects future calculations", async ({ page }) => {
  await page.click("#settingsBtn");
  await page.fill("#weeklyQuota", "1000");
  await page.fill("#commissionRate", "10");
  await page.click("#saveSettingsBtn");

  await page.fill("#saleDate", "2026-01-05");
  await page.fill("#saleAmount", "1500");
  await page.click("#saleForm button[type=submit]");

  await page.click('.filter-btn[data-period="weekly"]');
  const row = page.locator("#breakdownBody tr").first();
  await expect(row.locator("td[data-label='Quota']")).toHaveText("$1,000.00");
  await expect(row.locator("td[data-label='Over Quota']")).toHaveText("$500.00");
  await expect(row.locator("td[data-label='Commission']")).toHaveText("$50.00");
});
