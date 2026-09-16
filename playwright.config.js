// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  webServer: {
    command: "npx http-server -p 4173 -c-1 .",
    url: "http://localhost:4173/index.html",
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: "http://localhost:4173"
  }
});
