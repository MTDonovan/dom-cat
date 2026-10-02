const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { engine, regression, html } = require("./build-harness.cjs");
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

test("XPath DOM regressions (27 checks; namespace cases require Chromium)", () => {
  const dom = new JSDOM(
    '<!doctype html><pre id="test-report"></pre><iframe id="fixture"></iframe>',
    { runScripts: "dangerously" },
  );
  try {
    dom.window.eval(engine);
    dom.window.eval(regression);
    const report = dom.window.document.getElementById("test-report");
    assert.equal(report.dataset.failed, "0", report.textContent);
    assert.match(report.textContent, /^27 passed, 0 failed, 2 skipped/);
  } finally {
    dom.window.close();
  }
});

function sidebarDOM() {
  return new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://xpath-finder.test/sidebar.html",
  });
}
function input(dom, query) {
  const field = dom.window.document.getElementById("xpath-input");
  field.value = query;
  field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  dom.window.document.getElementById("run").click();
}
test("Sidebar initialization, query editing, errors, scalars, and history", async () => {
  const dom = sidebarDOM();
  const doc = dom.window.document;
  const fixture = doc.querySelector("iframe").contentDocument;
  try {
    await tick();
    assert.equal(doc.getElementById("count").textContent, "1");
    assert.match(doc.getElementById("status").textContent, /Unique match/);
    input(dom, "//button");
    await tick();
    assert.equal(doc.querySelectorAll(".result-row").length, 3);
    assert.equal(
      doc
        .querySelector("iframe")
        .contentDocument.querySelectorAll("xpath-finder-overlay").length,
      1,
    );
    let copied = "";
    dom.window.navigator.clipboard = {
      writeText: async (text) => {
        copied = text;
      },
    };
    doc.getElementById("copy-results").click();
    await tick();
    assert.equal(copied, "Save receipt\nSave\nSave");
    assert.equal(doc.getElementById("follow").checked, false);
    // Inspect must retain a manually authored query.
    doc.querySelectorAll(".inspect")[1].click();
    await tick();
    assert.equal(doc.getElementById("xpath-input").value, "//button");
    assert.equal(doc.querySelectorAll("#history button").length, 1);
    const copyTargets = fixture.createElement("div");
    for (let index = 0; index < 520; index++) {
      const target = fixture.createElement("span");
      target.setAttribute("data-copy-result", "");
      target.textContent = "Result " + index;
      copyTargets.append(target);
    }
    fixture.body.append(copyTargets);
    input(dom, "//*[@data-copy-result]");
    await tick();
    assert.equal(doc.querySelectorAll(".result-row").length, 500);
    doc.getElementById("copy-results").click();
    await tick();
    assert.deepEqual(copied.split("\n"), [
      ...Array.from({ length: 500 }, (_, index) => "Result " + index),
    ]);
    const resultLimit = doc.getElementById("result-limit");
    resultLimit.value = "unlimited";
    resultLimit.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await tick(100);
    assert.equal(doc.querySelectorAll(".result-row").length, 520);
    doc.getElementById("copy-results").click();
    await tick();
    assert.deepEqual(copied.split("\n"), [
      ...Array.from({ length: 520 }, (_, index) => "Result " + index),
    ]);
    input(dom, "count(//button)");
    await tick();
    assert.equal(doc.getElementById("count").textContent, "number");
    assert.equal(doc.querySelector(".scalar").textContent, "3");
    assert.equal(doc.getElementById("highlight").disabled, true);
    input(dom, "//*[");
    await tick();
    assert.equal(doc.getElementById("count").textContent, "0");
    assert.ok(doc.getElementById("status").classList.contains("error"));
    assert.equal(doc.getElementById("copy-results").disabled, true);
    input(dom, "//*[@missing]");
    await tick();
    assert.equal(doc.getElementById("count").textContent, "0");
    assert.match(doc.getElementById("status").textContent, /No matches/);
    doc.getElementById("clear-history").click();
    await tick();
    assert.equal(doc.querySelectorAll("#history button").length, 0);
  } finally {
    dom.window.close();
  }
});
test("Quotes and malicious-looking text stay data in the sidebar", async () => {
  const dom = sidebarDOM();
  const doc = dom.window.document;
  try {
    await tick();
    const fixture = doc.querySelector("iframe").contentDocument;
    const node = fixture.createElement("button");
    node.id = `Bob's "Save"`;
    node.textContent = "<img src=x onerror=alert(1)>";
    fixture.body.append(node);
    const query = "//*[@id=concat('Bob', \"'\", 's \"Save\"')]";
    input(dom, query);
    await tick();
    assert.equal(doc.getElementById("count").textContent, "1");
    assert.equal(
      doc.querySelector(".result-text").textContent,
      node.textContent,
    );
    assert.equal(doc.querySelectorAll("#results img").length, 0);
  } finally {
    dom.window.close();
  }
});
test("Newer query results win when callbacks arrive out of order", async () => {
  const dom = sidebarDOM();
  const doc = dom.window.document;
  try {
    await tick();
    dom.window.eval(`const originalEval = chrome.devtools.inspectedWindow.eval;
      chrome.devtools.inspectedWindow.eval = (expression, callback) => {
        const delay = expression.includes('"//button"') ? 80 : 0;
        originalEval(expression, (result, exception) => setTimeout(() => callback?.(result, exception), delay));
      };`);
    input(dom, "//button");
    input(dom, "//input");
    await tick(120);
    assert.equal(doc.getElementById("count").textContent, "1");
    assert.match(doc.querySelector(".node-label").textContent, /input/);
  } finally {
    dom.window.close();
  }
});
