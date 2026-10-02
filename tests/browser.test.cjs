const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
require("./build-harness.cjs");
test("XPath engine and sidebar browser regression", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(__dirname, "harness.html")).href);
    assert.equal(
      await page.locator("#test-report").getAttribute("data-failed"),
      "0",
      await page.locator("#test-report").textContent(),
    );
    const sidebar = page.frameLocator("#sidebar");
    await sidebar
      .locator("#status")
      .filter({ hasText: "Unique match" })
      .waitFor();
    assert.equal(await sidebar.locator("#count").textContent(), "1");
    await sidebar.locator("#xpath-input").fill("count(//button)");
    await sidebar.getByRole("button", { name: "Run query" }).click();
    await sidebar.locator("#count").filter({ hasText: "number" }).waitFor();
    assert.equal(await sidebar.locator(".scalar").textContent(), "3");
    await sidebar.locator("#xpath-input").fill("//*[");
    await sidebar.getByRole("button", { name: "Run query" }).click();
    await sidebar.locator("#status.error").waitFor();
    assert.equal(await sidebar.locator("#count").textContent(), "0");
    await sidebar.locator("#xpath-input").fill("//button");
    await sidebar.getByRole("button", { name: "Run query" }).click();
    await sidebar.locator(".result-row").nth(2).waitFor();
    await sidebar
      .getByRole("button", { name: "Inspect match 2", exact: true })
      .click();
    assert.equal(
      await sidebar.locator("#xpath-input").inputValue(),
      "//button",
    );
    await sidebar
      .getByRole("button", { name: "Use selected", exact: true })
      .click();
    await sidebar
      .locator("#status")
      .filter({ hasText: "Unique match" })
      .waitFor();
    await sidebar.locator("#path-mode").selectOption("absolute");
    await sidebar.locator("#xpath-input").filter({}).waitFor();
    await page.waitForFunction(() =>
      document
        .querySelector("#sidebar")
        .contentDocument.querySelector("#xpath-input")
        .value.startsWith("/html[1]"),
    );
  } finally {
    await browser.close();
  }
});
