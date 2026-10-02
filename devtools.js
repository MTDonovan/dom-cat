// The entry point creates the pane once; the sidebar is a separate page.
chrome.devtools.panels.elements.createSidebarPane("DOM Cat", (sidebar) => {
  sidebar.setPage("sidebar.html");
  sidebar.onHidden.addListener(() => {
    chrome.devtools.inspectedWindow.eval(`(() => {
      const key = Symbol.for('xpath-finder.overlay.v2');
      const old = globalThis[key];
      if (old) { old.host.remove(); clearTimeout(old.timer); delete globalThis[key]; }
    })()`);
  });
});
