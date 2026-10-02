const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const engine = fs.readFileSync(path.join(root, "xpath-engine.js"), "utf8");
const sidebar = fs.readFileSync(path.join(root, "sidebar.js"), "utf8");
const css = fs.readFileSync(path.join(root, "sidebar.css"), "utf8");
const script = (text) =>
  "<script>" + text.replace(/<\/script/gi, "<\\/script") + "</script>";
const fixture = `<main id="inventory"><h1>Inventory receipts</h1><button data-testid="save-receipt">Save receipt</button><button class="action">Save</button><button class="action">Save</button><input name="reference" value="REC-1042"><div id="multiline">One\nTwo</div><div id="empty"></div><svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg><!-- first --><!-- second --><p id="text">first <b>bold</b> last</p><div id="duplicates">x</div><div id="duplicates">y</div><span id="host"></span></main>`;
const mock = `
const target = document.createElement('iframe');
target.style.cssText='position:fixed;left:-10000px;width:800px;height:600px';
document.body.append(target);
target.contentDocument.open(); target.contentDocument.write(${JSON.stringify(fixture)}); target.contentDocument.close();
const inspected = target.contentWindow;
inspected.$0 = target.contentDocument.querySelector('[data-testid]');
const selectionListeners = []; const navigationListeners = [];
inspected.inspect = node => {inspected.$0 = node; selectionListeners.forEach(fn=>fn());};
const storage = {};
const chrome = {
  devtools: {
    inspectedWindow: {eval(expression,callback) {
      try {const value = inspected.eval(expression); callback?.(JSON.parse(JSON.stringify(value ?? null)),null);}
      catch(error){callback?.(undefined,{isException:true,value:String(error)});}
    }},
    panels:{elements:{onSelectionChanged:{addListener:fn=>selectionListeners.push(fn)}}},
    network:{onNavigated:{addListener:fn=>navigationListeners.push(fn)}}
  },
  storage:{local:{get:async()=>storage,set:async value=>Object.assign(storage,value),remove:async key=>{delete storage[key]}}}
};
`;
let html = fs.readFileSync(path.join(root, "sidebar.html"), "utf8");
html = html
  .replace(
    '<link rel="stylesheet" href="sidebar.css">',
    "<style>" + css + "</style>",
  )
  .replace('<script src="xpath-engine.js" defer></script>', "")
  .replace('<script src="sidebar.js" defer></script>', "")
  .replace(
    "</body>",
    script(mock) + script(engine) + script(sidebar) + "</body>",
  );
const regression = `
const report = document.getElementById('test-report');
const output = [];
let passed = 0, failed = 0, skipped = 0;
function test(name,fn){
  if (/jsdom/.test(navigator.userAgent) && ['Attribute path selects attribute','SVG namespaces'].includes(name)) {skipped++;output.push('SKIP '+name+' — jsdom namespace XPath limitation; run browser suite');return;}
  try{fn();passed++;output.push('PASS '+name)}catch(error){failed++;output.push('FAIL '+name+' — '+error.message)}
}
function equal(actual,expected){if(actual!==expected)throw Error(JSON.stringify(actual)+' != '+JSON.stringify(expected))}
function ok(value){if(!value)throw Error('Assertion failed')}
const doc = document.getElementById('fixture').contentDocument;
doc.open();doc.write(${JSON.stringify(fixture)});doc.close();
const e = createXPathEngine();
const get = selector => doc.querySelector(selector);
const matched = node => { const generated=e.generate(node,'smart'); const result=doc.evaluate(generated.query,doc,null,7,null);equal(result.snapshotLength,1);equal(result.snapshotItem(0),node);return generated.query; };
test('Test attributes preferred',()=>equal(matched(get('[data-testid]')),"//button[@data-testid='save-receipt']"));
test('Absolute root and sibling positions',()=>equal(e.generate(doc.querySelectorAll('button')[2],'absolute').query,'/html[1]/body[1]/main[1]/button[3]'));
test('Duplicate text and classes remain unique',()=>matched(doc.querySelectorAll('button')[1]));
test('Duplicate IDs remain unique',()=>matched(doc.querySelectorAll('#duplicates')[1]));
test('XPath literals containing both quotes',()=>{const n=doc.createElement('button');n.id='Bob'+String.fromCharCode(39)+'s "Save"';doc.body.append(n);matched(n);n.remove()});
test('Newline counts use nodes',()=>equal(e.evaluate('//*[@id="multiline"]',null).count,0));
test('Newline counts in selected document',()=>equal(e.evaluate('//*[@id="multiline"]',get('main')).count,1));
test('Empty text still counts',()=>equal(e.evaluate('//*[@id="empty"]',get('main')).count,1));
test('String result',()=>equal(e.evaluate('string(//h1)',get('main')).value,'Inventory receipts'));
test('Number result',()=>equal(e.evaluate('count(//button)',get('main')).value,'3'));
test('Boolean result',()=>equal(e.evaluate('boolean(//input)',get('main')).value,'true'));
test('Attribute values',()=>equal(e.evaluate('//input/@name',get('main')).items[0].text,'reference'));
test('Attribute path selects attribute',()=>matched(get('input').getAttributeNode('name')));
test('Comments resolve by position',()=>{const n=Array.from(get('main').childNodes).filter(n=>n.nodeType===8)[1];matched(n)});
test('Text nodes resolve by position',()=>matched(get('#text').lastChild));
test('SVG namespaces',()=>matched(get('circle')));
test('Document node',()=>equal(e.generate(doc,'absolute').query,'/'));
test('Invalid expression rejected',()=>{let threw=false;try{e.evaluate('//*[',get('main'))}catch{threw=true}ok(threw)});
test('Shadow root gets actionable error',()=>{const host=get('#host');const shadow=host.attachShadow({mode:'open'});const node=doc.createElement('button');shadow.append(node);let threw=false;try{e.generate(node,'smart')}catch(error){threw=error.message.includes('shadow')}ok(threw)});
test('Detached node rejected',()=>{let threw=false;try{e.generate(doc.createElement('div'),'smart')}catch{threw=true}ok(threw)});
test('Unsupported node rejected',()=>{let threw=false;try{e.generate(document.doctype,'smart')}catch{threw=true}ok(threw)});
test('Main context refuses frame locator generation',()=>{let threw=false;try{e.generate(get('button'),'smart',false)}catch{threw=true}ok(threw)});
test('Query text cannot execute JS',()=>{const query='//button[@id='+e.literal("'; globalThis.compromised=true; //")+']';equal(e.evaluate(query,get('main')).count,0);ok(!globalThis.compromised)});
test('Result text preserves markup as plain text',()=>{const n=doc.createElement('p');n.id='unsafe-text';n.textContent='<img src=x onerror=alert(1)>';doc.body.append(n);equal(e.evaluate('//*[@id="unsafe-text"]',get('main')).items[0].text,n.textContent);n.remove()});
test('Results capped while count stays exact',()=>{const wrap=doc.createElement('aside');for(let i=0;i<520;i++)wrap.append(doc.createElement('i'));doc.body.append(wrap);const r=e.evaluate('//i',get('main'));equal(r.count,520);equal(r.items.length,500);ok(r.limited);wrap.remove()});
test('Unlimited results return all matches',()=>{const wrap=doc.createElement('aside');for(let i=0;i<520;i++)wrap.append(doc.createElement('i'));doc.body.append(wrap);const r=e.evaluate('//i',get('main'),true,'unlimited');equal(r.count,520);equal(r.items.length,520);ok(!r.limited);wrap.remove()});
test('Long result text is explicitly truncated',()=>{const n=doc.createElement('em');n.textContent='x'.repeat(5000);doc.body.append(n);const r=e.evaluate('//em',get('main'));equal(r.items[0].text.length,4000);ok(r.items[0].truncated);n.remove()});
test('Inspect resolves attributes to owner elements',()=>equal(e.find('//input/@name',0,get('main')),get('input')));
test('Highlight removes overlays before evaluation',()=>{e.highlight('//button',get('main'));equal(doc.querySelectorAll('xpath-finder-overlay').length,1);e.evaluate('//*',get('main'));equal(doc.querySelectorAll('xpath-finder-overlay').length,0)});
report.textContent=passed+' passed, '+failed+' failed, '+skipped+' skipped\\n'+output.join('\\n');
report.dataset.failed=failed;
`;
const harness =
  '<!doctype html><html><head><meta charset="utf-8"><title>DOM Cat browser regression harness</title><style>body{font:13px system-ui;background:#eef0f6;padding:20px;display:flex;gap:30px}iframe#sidebar{width:390px;height:900px;border:1px solid #ccc;border-radius:12px}#fixture{position:fixed;left:-10000px;width:800px;height:600px}pre{white-space:pre-wrap;max-width:600px}h1{font-size:18px}</style></head><body><iframe id="sidebar" title="DOM Cat sidebar" srcdoc="' +
  html.replace(/&/g, "&amp;").replace(/"/g, "&quot;") +
  '"></iframe><section><h1>Browser regression checks</h1><p>DOM engine runs in Chromium. Chrome DevTools events and storage are mocked in the sidebar preview.</p><pre id="test-report">Running…</pre></section><iframe id="fixture" title="Test fixture"></iframe>' +
  script(engine) +
  script(regression) +
  "</body></html>";
fs.writeFileSync(path.join(__dirname, "harness.html"), harness);
console.log("Browser harness created: tests/harness.html");
module.exports = { regression, engine, sidebar, mock, html };
