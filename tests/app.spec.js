// @ts-check
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

test("adding a sale updates the summary totals", async ({ page }) => {
  await page.fill("#saleDate", "2026-09-10");
  await page.fill("#saleItem", "Leather Jacket");
  await page.fill("#saleAmount", "200");
  await page.fill("#saleCommissionRate", "10");
  await page.click("#saleForm button[type=submit]");

  await expect(page.locator("#sumRevenue")).toHaveText("$200.00");
  await expect(page.locator("#sumCommission")).toHaveText("$20.00");
  await expect(page.locator("#sumCount")).toHaveText("1");
  await expect(page.locator("#salesTableBody tr")).toHaveCount(1);
});

test("date-range filter excludes out-of-range sales", async ({ page }) => {
  await page.fill("#saleDate", "2026-09-10");
  await page.fill("#saleAmount", "200");
  await page.click("#saleForm button[type=submit]");

  await page.fill("#saleDate", "2020-01-01");
  await page.fill("#saleItem", "Old Sale");
  await page.fill("#saleAmount", "50");
  await page.click("#saleForm button[type=submit]");

  await page.click(".filter-btn[data-range=year]");
  await expect(page.locator("#salesTableBody tr")).toHaveCount(1);

  await page.click(".filter-btn[data-range=all]");
  await expect(page.locator("#salesTableBody tr")).toHaveCount(2);
});

test("editing a sale loads it back into the form", async ({ page }) => {
  await page.fill("#saleDate", "2026-09-10");
  await page.fill("#saleItem", "Leather Jacket");
  await page.fill("#saleAmount", "200");
  await page.click("#saleForm button[type=submit]");

  await page.click("#salesTableBody tr:first-child .btn-link-text");

  await expect(page.locator("#formTitle")).toHaveText("Edit Sale");
  await expect(page.locator("#saleItem")).toHaveValue("Leather Jacket");
});

test("after adding a sale, the item name stays filled in for fast repeat entry", async ({ page }) => {
  await page.fill("#saleDate", "2026-09-10");
  await page.fill("#saleItem", "Jordan 1 Chicago");
  await page.fill("#saleAmount", "180");
  await page.click("#saleForm button[type=submit]");

  await expect(page.locator("#saleItem")).toHaveValue("Jordan 1 Chicago");
  await expect(page.locator("#saleAmount")).toHaveValue("");
  await expect(page.locator("#saleAmount")).toBeFocused();

  await page.fill("#saleAmount", "190");
  await page.click("#saleForm button[type=submit]");

  await expect(page.locator("#salesTableBody tr")).toHaveCount(2);
  await expect(page.locator("#sumRevenue")).toHaveText("$370.00");
});

test("search filters the sales table and summary by item name", async ({ page }) => {
  await page.fill("#saleItem", "Jordan 1 Chicago");
  await page.fill("#saleAmount", "180");
  await page.click("#saleForm button[type=submit]");

  await page.fill("#saleItem", "Yeezy 350");
  await page.fill("#saleAmount", "220");
  await page.click("#saleForm button[type=submit]");

  await page.fill("#searchInput", "jordan");

  await expect(page.locator("#salesTableBody tr")).toHaveCount(1);
  await expect(page.locator("#sumRevenue")).toHaveText("$180.00");
});

test("qty defaults to 1 and is saved with the sale", async ({ page }) => {
  await page.fill("#saleItem", "Air Max 90");
  await page.fill("#saleQty", "5");
  await page.fill("#saleAmount", "500");
  await page.click("#saleForm button[type=submit]");

  const qtyCell = page.locator("#salesTableBody tr:first-child td[data-label=Qty]");
  await expect(qtyCell).toHaveText("5");
});
