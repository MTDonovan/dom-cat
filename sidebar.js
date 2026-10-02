"use strict";
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(
  [
    "xpath-input",
    "path-mode",
    "context",
    "result-limit",
    "follow",
    "status",
    "count",
    "results",
    "result-summary",
    "highlight",
    "copy-results",
    "alternatives",
    "alternatives-section",
    "history",
    "toast",
  ].map((id) => [id, $(id)]),
);
let revision = 0;
let debounce;
let toastTimer;
let history = [];
let lastResult = null;
let lastQuery = "";
let lastContext = true;
let suppressSelection = false;
let paneVisible = true;
const selection = '(typeof $0 === "undefined" ? null : $0)';
const engine = "(" + createXPathEngine.toString() + ")()";
const usesSelection = () => ui.context.value === "selected";

function status(message, type = "") {
  ui.status.textContent = message;
  ui.status.className = "status " + type;
}
function toast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  toastTimer = setTimeout(() => {
    ui.toast.hidden = true;
  }, 2600);
}
function pageEval(body) {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(
      "(() => {const engine = " + engine + ";" + body + "})()",
      (result, exception) => {
        if (exception?.isException || exception?.isError) {
          reject(
            new Error(
              exception.value ||
                exception.description ||
                "Chrome could not evaluate this query on the inspected page.",
            ),
          );
        } else if (!result || result.error) {
          reject(
            new Error(result?.error || "No response from the inspected page."),
          );
        } else resolve(result);
      },
    );
  });
}
// Query text is always encoded as a JS string, never interpolated as code.
function call(method, args) {
  return pageEval(
    "try {return engine." +
      method +
      "(" +
      args +
      ") || {ok:true};} catch(error) {return {error:String(error.message || error)};}",
  );
}
function resetResults(message = "Matches will appear here.") {
  lastResult = null;
  lastQuery = "";
  ui.count.textContent = "0";
  ui["result-summary"].textContent = message;
  ui.highlight.disabled = true;
  ui["copy-results"].disabled = true;
  ui.results.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  ui.results.append(empty);
}
function invalidate() {
  revision++;
  clearTimeout(debounce);
  ui.highlight.disabled = true;
  ui["copy-results"].disabled = true;
  lastResult = null;
  call("clearHighlight", "").catch(() => {});
}
function renderResult(result, query, selectedContext) {
  lastResult = result;
  lastQuery = query;
  lastContext = selectedContext;
  ui.results.replaceChildren();
  ui["copy-results"].disabled = false;
  ui.highlight.disabled = result.kind !== "nodes" || result.count === 0;
  if (result.kind !== "nodes") {
    ui.count.textContent = result.kind;
    ui["result-summary"].textContent =
      result.context + " · " + result.kind + " value";
    const value = document.createElement("pre");
    value.className = "result-text scalar";
    value.textContent = result.value;
    ui.results.append(value);
    status("Valid XPath · " + result.kind + " result", "success");
    return;
  }
  ui.count.textContent = result.count.toLocaleString();
  const limits = [];
  if (result.limited)
    limits.push("showing first " + result.displayLimit + " matches");
  if (result.items.some((item) => item.truncated))
    limits.push("text limited to 4,000 characters per match");
  ui["result-summary"].textContent =
    result.context +
    (limits.length
      ? " · " + limits.join(" · ")
      : " · " +
        result.count +
        " matched node" +
        (result.count === 1 ? "" : "s"));
  if (!result.count) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No matches. Check the query or document context.";
    ui.results.append(empty);
    status("Valid XPath · No matches");
    return;
  }
  for (const item of result.items) {
    const row = document.createElement("div");
    row.className = "result-row";
    const heading = document.createElement("div");
    heading.className = "row-heading";
    const label = document.createElement("span");
    label.className = "node-label";
    label.textContent = item.index + 1 + "  " + item.label;
    label.title = item.label;
    const inspectButton = document.createElement("button");
    inspectButton.className = "inspect";
    inspectButton.textContent = "Inspect";
    inspectButton.setAttribute(
      "aria-label",
      "Inspect match " + (item.index + 1),
    );
    inspectButton.addEventListener("click", async () => {
      if (query !== ui["xpath-input"].value.trim() || !lastResult) {
        toast("Run the current query first.");
        return;
      }
      suppressSelection = true;
      try {
        await pageEval(
          "try {const node = engine.find(" +
            JSON.stringify(query) +
            "," +
            item.index +
            "," +
            selection +
            "," +
            selectedContext +
            "); inspect(node); return {ok:true};} catch(error) {return {error:String(error.message || error)};}",
        );
      } catch (error) {
        status(error.message, "error");
      } finally {
        setTimeout(() => {
          suppressSelection = false;
        }, 300);
      }
    });
    heading.append(label, inspectButton);
    const text = document.createElement("pre");
    text.className = "result-text";
    text.textContent =
      item.text + (item.truncated ? "\n[…text truncated]" : "");
    row.append(heading, text);
    ui.results.append(row);
  }
  status(
    "Valid XPath · " +
      (result.count === 1 ? "Unique match" : result.count + " matches"),
    "success",
  );
}
async function highlightMatches(
  query,
  selectedContext,
  token,
  announce = false,
) {
  const result = await call(
    "highlight",
    JSON.stringify(query) + "," + selection + "," + selectedContext,
  );
  if (token !== revision || !announce) return;
  toast(
    result.boxes
      ? "Highlighted for 3 seconds" +
          (result.total > 100 ? " (first 100 matches)" : "")
      : "Matched nodes have no visible boxes.",
  );
}
async function runQuery(save = false) {
  clearTimeout(debounce);
  const token = ++revision;
  const query = ui["xpath-input"].value.trim();
  const selectedContext = usesSelection();
  if (!query) {
    resetResults("Enter an XPath or inspect an element.");
    status("Enter an XPath or inspect an element.");
    return;
  }
  status("Evaluating…");
  try {
    const result = await call(
      "evaluate",
      JSON.stringify(query) +
        "," +
        selection +
        "," +
        selectedContext +
        "," +
        JSON.stringify(ui["result-limit"].value),
    );
    if (token !== revision) return;
    renderResult(result, query, selectedContext);
    if (result.kind === "nodes" && result.count) {
      try {
        await highlightMatches(query, selectedContext, token);
      } catch (error) {
        if (token === revision) status(error.message, "error");
      }
    }
    if (save) addHistory(query);
  } catch (error) {
    if (token !== revision) return;
    resetResults("Could not evaluate this query.");
    status(error.message, "error");
  }
}
async function useSelection() {
  invalidate();
  const token = revision;
  try {
    const result = await call(
      "generate",
      selection +
        "," +
        JSON.stringify(ui["path-mode"].value) +
        "," +
        usesSelection(),
    );
    if (token !== revision) return;
    ui["xpath-input"].value = result.query;
    ui.alternatives.replaceChildren();
    ui["alternatives-section"].hidden = result.alternatives.length < 2;
    for (const path of result.alternatives) {
      const button = document.createElement("button");
      button.textContent = path;
      button.addEventListener("click", () => setManualQuery(path));
      ui.alternatives.append(button);
    }
    await runQuery();
  } catch (error) {
    if (token !== revision) return;
    resetResults("Select a document element to generate a path.");
    ui["alternatives-section"].hidden = true;
    status(error.message, "error");
  }
}
function manualEdit() {
  invalidate();
  // Pin a manually authored query so Inspect and selection changes do not replace it.
  ui.follow.checked = false;
  ui["alternatives-section"].hidden = true;
  status("Editing query…");
  debounce = setTimeout(() => runQuery(), 250);
  saveSettings();
}
function setManualQuery(query) {
  ui["xpath-input"].value = query;
  manualEdit();
  runQuery(true);
}
function renderHistory() {
  ui.history.replaceChildren();
  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Run a query to save it here.";
    ui.history.append(empty);
  }
  for (const entry of history) {
    const button = document.createElement("button");
    button.className = "query";
    button.textContent = entry;
    button.addEventListener("click", () => setManualQuery(entry));
    ui.history.append(button);
  }
}
function addHistory(query) {
  history = [query, ...history.filter((entry) => entry !== query)].slice(0, 20);
  renderHistory();
  chrome.storage.local
    .set({ xpathFinderHistory: history })
    .catch(() => toast("Could not save query history."));
}
function saveSettings() {
  chrome.storage.local
    .set({
      xpathFinderSettings: {
        mode: ui["path-mode"].value,
        context: ui.context.value,
        resultLimit: ui["result-limit"].value,
        follow: ui.follow.checked,
      },
    })
    .catch(() => {});
}
async function copy(text, message) {
  if (!text) {
    toast("Nothing to copy yet.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    const temporary = document.createElement("textarea");
    temporary.value = text;
    temporary.style.cssText = "position:fixed;opacity:0";
    document.body.append(temporary);
    temporary.select();
    const copied = document.execCommand("copy");
    temporary.remove();
    toast(
      copied
        ? message
        : "Clipboard unavailable. Select the text and copy it manually.",
    );
  }
}
$("run").addEventListener("click", () => runQuery(true));
$("use-selection").addEventListener("click", useSelection);
ui["xpath-input"].addEventListener("input", manualEdit);
ui["xpath-input"].addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    runQuery(true);
  }
});
$("copy-query").addEventListener("click", () =>
  copy(ui["xpath-input"].value.trim(), "XPath copied"),
);
function copyResults() {
  if (!lastResult) return;
  const result = lastResult;
  copy(
    result.kind === "nodes"
      ? result.items
          .map(
            (item) => item.text + (item.truncated ? "\n[…text truncated]" : ""),
          )
          .join("\n")
      : result.value,
    result.limited || result.items?.some((item) => item.truncated)
      ? "Displayed results copied (limits apply)"
      : "Results copied",
  );
}
ui["copy-results"].addEventListener("click", copyResults);
ui.highlight.addEventListener("click", async () => {
  const token = revision;
  try {
    await highlightMatches(lastQuery, lastContext, token, true);
  } catch (error) {
    if (token === revision) status(error.message, "error");
  }
});
ui["path-mode"].addEventListener("change", () => {
  saveSettings();
  useSelection();
});
ui.context.addEventListener("change", () => {
  invalidate();
  saveSettings();
  ui.follow.checked ? useSelection() : runQuery();
});
ui["result-limit"].addEventListener("change", () => {
  saveSettings();
  if (ui["result-limit"].value === "unlimited")
    toast("Unlimited results may slow or freeze DevTools.");
  runQuery();
});
ui.follow.addEventListener("change", () => {
  saveSettings();
  if (ui.follow.checked) useSelection();
});
$("clear-history").addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  history = [];
  renderHistory();
  chrome.storage.local
    .remove("xpathFinderHistory")
    .catch(() => toast("Could not clear saved history."));
});
chrome.devtools.panels.elements.onSelectionChanged.addListener(() => {
  if (suppressSelection || !paneVisible) return;
  if (ui.follow.checked) useSelection();
  else {
    invalidate();
    runQuery();
  }
});
chrome.devtools.network.onNavigated.addListener(() => {
  invalidate();
  ui["alternatives-section"].hidden = true;
  resetResults("Page changed. Run the query again or inspect an element.");
  status("Page changed. Run the query again or inspect an element.");
});
// When DevTools hides the pane, promptly remove our transient overlay.
document.addEventListener("visibilitychange", () => {
  paneVisible = !document.hidden;
  if (!paneVisible) invalidate();
  else if (ui.follow.checked) useSelection();
  else runQuery();
});
window.addEventListener("pagehide", () =>
  call("clearHighlight", "").catch(() => {}),
);
async function initialize() {
  try {
    const stored = await chrome.storage.local.get([
      "xpathFinderHistory",
      "xpathFinderSettings",
    ]);
    history = Array.isArray(stored.xpathFinderHistory)
      ? stored.xpathFinderHistory
          .filter((entry) => typeof entry === "string")
          .slice(0, 20)
      : [];
    const settings = stored.xpathFinderSettings;
    if (settings) {
      ui["path-mode"].value =
        settings.mode === "absolute" ? "absolute" : "smart";
      ui.context.value = settings.context === "main" ? "main" : "selected";
      ui["result-limit"].value = ["100", "500", "1000", "5000", "unlimited"].includes(
        settings.resultLimit,
      )
        ? settings.resultLimit
        : "500";
      ui.follow.checked = settings.follow !== false;
    }
  } catch {
    toast("Saved preferences are unavailable.");
  }
  renderHistory();
  if (ui.follow.checked) await useSelection();
}
initialize();
