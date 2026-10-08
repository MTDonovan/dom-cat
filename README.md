<p align="center">
  <img src="./assets/dom-cat-logo.png" alt="DOM Cat logo">
</p>

A Chrome DevTools extension for generating and testing XPath locators. No build
step, server, account, or runtime dependencies are required.

Also, if you enjoy my work, please consider sending a tip on Ko-fi.

<a href='https://ko-fi.com/K3K0M68XX' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

# Install or update

1.  Extract this ZIP to a permanent folder on your computer.
2.  Open `chrome://extensions`{.verbatim} and enable **Developer mode**.
3.  Click **Load unpacked** and select the folder containing manifest.json. If
    updating an existing unpacked installation, replace its files and click
    **Reload** on its extension card instead.
4.  Close and reopen DevTools on the page you want to inspect.
5.  Open Elements, select a page element, and find DOM Cat in the sidebar next
    to Styles/Computed. Narrow DevTools layouts may put it in the sidebar
    overflow menu.

# Use it

- Smart paths prefer `data-testid`{.verbatim}, `data-test-id`{.verbatim},
  `data-test`{.verbatim}, `data-qa`{.verbatim}, and `data-cy`{.verbatim},
  followed by IDs and other descriptive attributes. Every proposed path is
  checked against the document to ensure it identifies the selected node
  uniquely. If necessary, the engine anchors to a unique ancestor or uses an
  absolute path.
- Absolute paths start at the document root and include sibling positions, such
  as `/html[1]/body[1]/main[1]/button[3]`{.verbatim}.
- Selecting a node in Elements generates its path while **Follow Elements
  selection** is enabled. Editing the query automatically pauses following.
  **Use selected** generates a new path once.
- Queries evaluate after a short typing pause. Click **Run query** or press
  **Ctrl+Enter** (Cmd+Enter on macOS) to evaluate and save the query in history.
- Running a query automatically draws temporary boxes for three seconds around
  element and text matches. It uses a separate overlay and does not change the
  matched elements\' styles. Use **Highlight again** to refresh boxes after
  scrolling or resizing.
- **Copy XPath** copies the current expression. **Copy results** copies
  displayed text value results, separated by newlines.
- **Recent queries** keeps the last 20 explicitly run queries locally. Click one
  to run it again, or **Clear** to remove the history.

## Example queries

```text
//button[@data-testid='save-receipt']
//input/@name
//comment()
count(//button)
string(//h1)
boolean(//input[@name='reference'])
```

Node queries show an exact match count, including nodes with empty text or
multiline text. Number, string, and boolean expressions show their value and
type instead of a node count. Invalid expressions show an error and clear the
previous result state.

# Document context and limits

- **Selected document** evaluates against the inspected node\'s document when
  accessible. Otherwise, with no selection, it uses the main document. This
  supports accessible frame documents. **Main document** always queries the top
  document. A generated path for a frame node is relative to that frame\'s
  document.
- XPath does not cross iframe or shadow-root boundaries. Shadow-root selections
  receive a clear error. Cross-origin or isolated frames can be inaccessible
  through the top-frame DevTools evaluation context. This version does not
  provide a frame picker for those cases.
- Expressions use the browser\'s XPath 1.0 implementation. Namespaced SVG paths
  use `local-name()`{.verbatim} and `namespace-uri()`{.verbatim}.
- The Results menu controls how many nodes are displayed and copied: 100, 500
  (the default), 1,000, 5,000, or Unlimited. The count remains exact, and the
  interface identifies truncation. Unlimited can slow or freeze DevTools on very
  large match sets. Each displayed result remains limited to 4,000 text
  characters. Highlighting considers the first 100 matches and draws at most 300
  boxes.
- Queries run on demand, after editing, or after selection changes. The
  extension does not continuously watch DOM mutations.

# Privacy and permissions

The extension requests `storage`{.verbatim} to save local history and
preferences, and `clipboardWrite`{.verbatim} only to copy XPath expressions or
displayed results when you request it. It has no external requests or telemetry.
Query history and preferences use `chrome.storage.local`{.verbatim}, not Chrome
Sync. Inspected result text is not saved. History may contain values you include
in a query. Use **Clear** to remove it.

# Development and checks

All extension code is plain JavaScript, HTML, and CSS. `devtools.js`{.verbatim}
registers the pane once. `sidebar.js`{.verbatim} controls the interface.
`xpath-engine.js`{.verbatim} supplies the self-contained engine serialized into
the inspected page. Query expressions are encoded using
`JSON.stringify`{.verbatim} before evaluation, and results render using text
nodes rather than HTML.

For local DOM regression checks (Node.js 20+):

```sh
npm install npm test
```

The DOM suite exercises unique locators, duplicate IDs and classes, quote
escaping, node counts, scalar expressions, invalid queries, comments/text nodes,
detached and shadow nodes, safe result rendering, result limits, query history,
and asynchronous callback ordering.

jsdom lacks the necessary namespace XPath behavior for two cases (SVG and
namespaced attribute paths). Those checks are retained in the browser suite.

For the Chromium browser suite:

```sh
npx playwright install chromium
npm run test:browser
```

To create a standalone visual and regression harness, run `npm run
preview`{.verbatim} and open `tests/harness.html`{.verbatim} in Chrome. Its
sidebar uses mocked DevTools events and storage.

Browser tests exercise the DOM engine and sidebar interactions. They do not
verify Chrome\'s actual extension loader, native Elements integration, or
clipboard permissions. Check those manually after installing the unpacked
extension.

## Chrome Web Store package

On Windows, create the upload ZIP with:

```sh
npm run package:chrome-store
```

The command validates the Manifest V3 configuration and required extension
files, then creates `dist/dom-cat-<version>-chrome-store.zip`. Upload that ZIP
directly to the Chrome Web Store; it excludes development dependencies, tests,
and repository metadata.
