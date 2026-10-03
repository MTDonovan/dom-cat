/* Self-contained: serialized into the inspected page by DevTools. */
function createXPathEngine() {
  const overlayKey = Symbol.for("xpath-finder.overlay.v2");
  function clearHighlight() {
    const old = globalThis[overlayKey];
    if (old) {
      old.host.remove();
      clearTimeout(old.timer);
      delete globalThis[overlayKey];
    }
  }
  function literal(value) {
    value = String(value);
    if (!value.includes("'")) return "'" + value + "'";
    if (!value.includes('"')) return '"' + value + '"';
    return (
      "concat(" +
      value
        .split("'")
        .map((part) => "'" + part + "'")
        .join(', "\'", ') +
      ")"
    );
  }
  function nodeTest(node) {
    if (node.nodeType === 3) return "text()";
    if (node.nodeType === 8) return "comment()";
    if (node.nodeType === 7)
      return "processing-instruction(" + literal(node.target) + ")";
    if (node.namespaceURI === "http://www.w3.org/1999/xhtml")
      return node.localName;
    return (
      "*[local-name()=" +
      literal(node.localName) +
      " and namespace-uri()=" +
      literal(node.namespaceURI || "") +
      "]"
    );
  }
  function segment(node) {
    const siblings = Array.from(node.parentNode?.childNodes || []).filter(
      (other) =>
        other.nodeType === node.nodeType &&
        (node.nodeType !== 1 ||
          (other.localName === node.localName &&
            other.namespaceURI === node.namespaceURI)) &&
        (node.nodeType !== 7 || other.target === node.target),
    );
    return nodeTest(node) + "[" + (siblings.indexOf(node) + 1) + "]";
  }
  function attributeTest(node) {
    return (
      "@*[local-name()=" +
      literal(node.localName) +
      (node.namespaceURI
        ? " and namespace-uri()=" + literal(node.namespaceURI)
        : " and not(namespace-uri())") +
      "]"
    );
  }
  function absolute(node) {
    if (node.nodeType === 9) return "/";
    if (node.nodeType === 2)
      return absolute(node.ownerElement) + "/" + attributeTest(node);
    const parts = [];
    for (
      let current = node;
      current && current.nodeType !== 9;
      current = current.parentNode
    ) {
      if (current.nodeType === 11)
        throw new Error(
          "XPath cannot cross a shadow root. Select an element in the regular document.",
        );
      parts.unshift(segment(current));
    }
    return "/" + parts.join("/");
  }
  function context(selected, useSelection) {
    const doc =
      useSelection && selected
        ? selected.nodeType === 9
          ? selected
          : selected.ownerDocument
        : document;
    if (!doc)
      throw new Error(
        "No document is available. Inspect a page element first.",
      );
    return doc;
  }
  function snapshot(query, doc) {
    return doc.evaluate(query, doc, null, 7, null);
  }
  function unique(query, node, doc) {
    try {
      const result = snapshot(query, doc);
      return result.snapshotLength === 1 && result.snapshotItem(0) === node;
    } catch {
      return false;
    }
  }
  function candidates(node) {
    if (node.nodeType !== 1) return [];
    const tag = nodeTest(node);
    const paths = [];
    for (const name of [
      "data-testid",
      "data-test-id",
      "data-test",
      "data-qa",
      "data-cy",
      "id",
      "name",
      "aria-label",
      "title",
      "placeholder",
    ]) {
      const value = node.getAttribute(name);
      if (value && value.length <= 200)
        paths.push("//" + tag + "[@" + name + "=" + literal(value) + "]");
    }
    const text = node.textContent
      ?.replace(/[\x20\t\r\n]+/g, " ")
      .replace(/^ | $/g, "");
    if (text && text.length <= 100 && node.children.length === 0)
      paths.push("//" + tag + "[normalize-space(.)=" + literal(text) + "]");
    const classes = Array.from(node.classList || [])
      .filter((value) => value.length <= 80)
      .slice(0, 3);
    const checks = classes.map(
      (value) =>
        "contains(concat(' ', normalize-space(@class), ' '), " +
        literal(" " + value + " ") +
        ")",
    );
    for (const check of checks) paths.push("//" + tag + "[" + check + "]");
    if (checks.length > 1)
      paths.push("//" + tag + "[" + checks.join(" and ") + "]");
    return paths;
  }
  function describe(node) {
    if (node.nodeType === 9) return "#document";
    if (node.nodeType === 2) return "@" + node.name;
    if (node.nodeType === 3) return "#text";
    if (node.nodeType === 8) return "#comment";
    if (node.nodeType === 7) return "<?" + node.target + "?>";
    return (
      "<" +
      node.localName +
      (node.id ? ' id="' + node.id.slice(0, 70) + '"' : "") +
      ">"
    );
  }
  function generate(selected, mode, useSelection = true) {
    clearHighlight();
    if (!selected || !selected.nodeType)
      throw new Error(
        "Inspect an element in the Elements panel to generate its XPath.",
      );
    if (![1, 2, 3, 7, 8, 9].includes(selected.nodeType))
      throw new Error(
        "This node type is not supported by XPath. Select an element, text, comment, or attribute.",
      );
    const rootNode = selected.nodeType === 2 ? selected.ownerElement : selected;
    if (!rootNode.isConnected)
      throw new Error(
        "The selected node is detached. Inspect an element that is still on the page.",
      );
    if (rootNode.getRootNode().nodeType === 11)
      throw new Error(
        "XPath cannot cross a shadow root. Select an element in the regular document.",
      );
    const doc = context(selected, useSelection);
    if (selected !== doc && selected.ownerDocument !== doc)
      throw new Error(
        "This node belongs to another frame. Switch Context to Selected document.",
      );
    const full = absolute(selected);
    const paths = candidates(selected).filter((path) =>
      unique(path, selected, doc),
    );
    if (mode !== "absolute" && paths.length === 0 && selected.nodeType !== 9) {
      const suffix = [];
      let child = selected.nodeType === 2 ? selected.ownerElement : selected;
      if (selected.nodeType === 2) suffix.unshift(attributeTest(selected));
      while (child?.parentNode && child.parentNode.nodeType !== 9) {
        suffix.unshift(segment(child));
        const parent = child.parentNode;
        const anchor = candidates(parent).find((path) =>
          unique(path, parent, doc),
        );
        if (anchor) {
          paths.push(anchor + "/" + suffix.join("/"));
          break;
        }
        child = parent;
      }
    }
    if (!paths.includes(full)) paths.push(full);
    return {
      query: mode === "absolute" ? full : paths[0],
      alternatives: paths.slice(0, 5),
      label: describe(selected),
      context: doc === document ? "Main document" : "Selected frame document",
    };
  }
  function evaluate(query, selected, useSelection = true, resultLimit = 500) {
    clearHighlight();
    const doc = context(selected, useSelection);
    const result = doc.evaluate(query, doc, null, 0, null);
    const base = {
      context: doc === document ? "Main document" : "Selected frame document",
    };
    if (result.resultType === 1)
      return { ...base, kind: "number", value: String(result.numberValue) };
    if (result.resultType === 2)
      return { ...base, kind: "string", value: result.stringValue };
    if (result.resultType === 3)
      return { ...base, kind: "boolean", value: String(result.booleanValue) };
    const nodes = snapshot(query, doc);
    const limit =
      resultLimit === "unlimited"
        ? Infinity
        : [100, 500, 1000, 5000].includes(Number(resultLimit))
          ? Number(resultLimit)
          : 500;
    const items = [];
    for (
      let index = 0;
      index < Math.min(nodes.snapshotLength, limit);
      index++
    ) {
      const node = nodes.snapshotItem(index);
      const value = node.nodeType === 2 ? node.value : node.textContent || "";
      items.push({
        index,
        label: describe(node),
        text: value.slice(0, 4000),
        truncated: value.length > 4000,
      });
    }
    return {
      ...base,
      kind: "nodes",
      count: nodes.snapshotLength,
      items,
      limited: nodes.snapshotLength > items.length,
      displayLimit: Number.isFinite(limit) ? limit : null,
    };
  }
  function find(query, index, selected, useSelection = true) {
    clearHighlight();
    const node = snapshot(query, context(selected, useSelection)).snapshotItem(
      index,
    );
    if (!node)
      throw new Error("This match no longer exists. Run the query again.");
    return node.nodeType === 2 ? node.ownerElement : node;
  }
  function highlight(query, selected, useSelection = true) {
    clearHighlight();
    const doc = context(selected, useSelection);
    const nodes = snapshot(query, doc);
    const rects = [];
    for (let i = 0; i < Math.min(nodes.snapshotLength, 100); i++) {
      let node = nodes.snapshotItem(i);
      if (node.nodeType === 2) node = node.ownerElement;
      if (node.nodeType === 1) rects.push(...node.getClientRects());
      else if (node.nodeType === 3) {
        const range = doc.createRange();
        range.selectNodeContents(node);
        rects.push(...range.getClientRects());
      }
    }
    const host = doc.createElement("xpath-finder-overlay");
    host.style.cssText =
      "all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;";
    const shadow = host.attachShadow({ mode: "closed" });
    for (const rect of rects.slice(0, 300)) {
      if (!rect.width || !rect.height) continue;
      const box = doc.createElement("div");
      box.style.cssText = `position:absolute;box-sizing:border-box;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;border:2px solid #7c6cff;background:rgba(124,108,255,.16);pointer-events:none;`;
      shadow.append(box);
    }
    doc.documentElement.append(host);
    globalThis[overlayKey] = { host, timer: setTimeout(clearHighlight, 3000) };
    return {
      count: Math.min(nodes.snapshotLength, 100),
      total: nodes.snapshotLength,
      boxes: shadow.childElementCount,
    };
  }
  return {
    literal,
    absolute,
    generate,
    evaluate,
    find,
    highlight,
    clearHighlight,
  };
}
globalThis.createXPathEngine = createXPathEngine;
