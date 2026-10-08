const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// This small DOM runs the production event handlers. It does not render pixels,
// synthesize native pointer input, or stand in for mobile/browser layout QA.
const decode = s => s.replace(/&(?:amp|lt|gt|quot|#39);/g, x => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[x]));
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const voidTags = new Set(['input', 'br', 'hr', 'img', 'link', 'meta']);
class TextNode {
  constructor(text, parent) { this.textContent = text; this.parentElement = parent; }
  get outerHTML() { return escape(this.textContent); }
}
class Element {
  constructor(tag, attrs = {}, parent = null) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.parentElement = parent;
    this.children = []; this.style = {}; this.listeners = {};
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const add = force === undefined ? !names.has(name) : force;
        add ? names.add(name) : names.delete(name); this.className = [...names].join(' '); return add;
      },
      add: name => this.classList.toggle(name, true), remove: name => this.classList.toggle(name, false)
    };
  }
  get className() { return this.attrs.class || ''; }
  set className(value) { this.attrs.class = value; }
  get dataset() { return Object.fromEntries(Object.entries(this.attrs).filter(([k]) => k.startsWith('data-')).map(([k,v]) => [k.slice(5).replace(/-([a-z])/g, (_,c) => c.toUpperCase()), v])); }
  get textContent() { return this.children.map(n => n.textContent).join(''); }
  set textContent(value) { this.children = [new TextNode(String(value), this)]; }
  get innerHTML() { return this.children.map(n => n.outerHTML).join(''); }
  set innerHTML(value) { this.children = []; parse(String(value), this); }
  get outerHTML() { return '<' + this.tagName.toLowerCase() + Object.entries(this.attrs).map(([k,v]) => ' ' + k + '="' + escape(v) + '"').join('') + '>' + this.innerHTML + (voidTags.has(this.tagName.toLowerCase()) ? '' : '</' + this.tagName.toLowerCase() + '>'); }
  get value() { return this._value ?? this.attrs.value ?? (this.tagName === 'SELECT' ? this.querySelector('option')?.value || '' : ''); }
  set value(value) { this._value = String(value); }
  get disabled() { return 'disabled' in this.attrs; }
  set disabled(value) { value ? this.attrs.disabled = '' : delete this.attrs.disabled; }
  get checked() { return 'checked' in this.attrs; }
  set checked(value) { value ? this.attrs.checked = '' : delete this.attrs.checked; }
  get open() { return 'open' in this.attrs; }
  set open(value) { value ? this.attrs.open = '' : delete this.attrs.open; }
  get hidden() { return 'hidden' in this.attrs; }
  set hidden(value) { value ? this.attrs.hidden = '' : delete this.attrs.hidden; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  querySelectorAll(selector) {
    const found = [];
    const visit = node => { for (const child of node.children) if (child instanceof Element) { if (matches(child, selector)) found.push(child); visit(child); } };
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (matches(node, selector)) return node; return null; }
  addEventListener(type, callback, capture) { (this.listeners[type] ||= []).push({callback, capture}); }
  dispatch(type, extra = {}) {
    const event = {type, target:this, preventDefault(){}, ...extra};
    const ancestry = []; for (let node = this; node; node = node.parentElement) ancestry.push(node);
    for (const node of [...ancestry].reverse()) for (const l of node.listeners[type] || []) if (l.capture) l.callback({...event, currentTarget:node});
    for (const node of ancestry) {
      node['on' + type]?.({...event, currentTarget:node});
      for (const l of node.listeners[type] || []) if (!l.capture) l.callback({...event, currentTarget:node});
    }
  }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { /* Focus placement has no bearing on the state assertions. */ }
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}
function matches(node, selector) {
  // The app uses tag/class/id/attribute selectors with descendants or children.
  const tokens = selector.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/);
  function atom(n, token) {
    if (!(n instanceof Element)) return false;
    const tag = token.match(/^[a-z][\w-]*/i); if (tag && n.tagName !== tag[0].toUpperCase()) return false;
    for (const [,id] of token.matchAll(/#([\w-]+)/g)) if (n.attrs.id !== id) return false;
    for (const [,name] of token.matchAll(/\.([\w-]+)/g)) if (!n.classList.contains(name)) return false;
    for (const [,name,,value] of token.matchAll(/\[([\w-]+)(?:=(["']?)(.*?)\2)?\]/g)) if (!(name in n.attrs) || value !== undefined && n.attrs[name] !== value) return false;
    if (token.includes(':checked') && !n.checked) return false;
    return true;
  }
  function part(n, index) {
    if (!atom(n, tokens[index])) return false;
    if (!index) return true;
    if (tokens[index - 1] === '>') return part(n.parentElement, index - 2);
    for (let p = n.parentElement; p; p = p.parentElement) if (part(p, index - 1)) return true;
    return false;
  }
  return part(node, tokens.length - 1);
}
function parse(html, root) {
  const stack = [root];
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || []) {
    const parent = stack.at(-1);
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (token.startsWith('</')) { assert.ok(stack.length > 1, 'Unexpected HTML closing tag'); const name = token.match(/^<\/([\w-]+)/)[1]; assert.equal(stack.at(-1).tagName, name.toUpperCase(), 'Mismatched HTML tags'); stack.pop(); continue; }
    if (token.startsWith('<')) {
      const name = token.match(/^<([\w-]+)/)[1], attrs = {};
      const body = token.slice(name.length + 1).replace(/\/?\s*>$/, '');
      for (const [,key,,value,bare] of body.matchAll(/([\w:-]+)(?:\s*=\s*(?:(["'])(.*?)\2|([^\s>]+)))?/g)) attrs[key] = decode(value ?? bare ?? '');
      const node = new Element(name, attrs, parent); parent.children.push(node);
      if (!voidTags.has(name.toLowerCase()) && !token.endsWith('/>')) stack.push(node);
    } else parent.children.push(new TextNode(decode(token), parent));
  }
  assert.equal(stack.length, 1, 'Unclosed HTML tag');
}
function appHarness() {
  const document = new Element('document');
  document.innerHTML = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  const timers = new Map(), registered = new Map(); let nextTimer = 0, randomSeed = 7;
  document.modelContext = {registerTool(tool) { registered.set(tool.name, tool); }};
  const math = Object.create(Math); math.random = () => { randomSeed = randomSeed * 48271 % 2147483647; return randomSeed / 2147483647; };
  const context = {
    window:{scrollTo(){}}, document, Math:math,
    matchMedia:() => ({matches:true}), performance:{now:() => 0},
    setInterval:callback => { timers.set(++nextTimer, callback); return nextTimer; }, clearInterval:id => timers.delete(id),
    setTimeout:() => ++nextTimer, clearTimeout(){}, requestAnimationFrame(){ throw Error('Reduced-motion path should render immediately'); }, cancelAnimationFrame(){}
  };
  vm.createContext(context);
  for (const script of document.querySelectorAll('script[src]')) vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', script.getAttribute('src')), 'utf8'), context);
  const query = selector => { const node = document.querySelector(selector); assert.ok(node, 'Missing UI: ' + selector); return node; };
  const read = () => registered.get('read_political_test').execute();
  const data = context.window.PoliticsData;
  function selectTopics(levels) { for (let topic = 0; topic < data.topics.length; topic++) query('#priority-list [data-topic="' + topic + '"][data-level="' + (levels[topic] ?? 0) + '"]').click(); }
  function setMode(mode) { const input = query('input[name="mode"][value="' + mode + '"]'); input.checked = true; input.dispatch('change'); }
  function answer(q, axis) {
    if (axis === null) { query('#skip').click(); return null; }
    const canonical = axis / q.d;
    const flipped = query('.pole[data-value="-1"] span').textContent !== q.a;
    const slider = query('#answer'); slider.value = canonical * (flipped ? -1 : 1) * 100; slider.dispatch('input'); query('#next').click(); return canonical;
  }
  function finish(value = () => 0, limit = 200) {
    const ids = [], answers = {}; let boards = 0;
    for (let step = 0; step < limit; step++) {
      const state = read();
      if (state.view === 'result') return {ids, answers, boards};
      if (state.view === 'board') { boards++; query('#continue').click(); continue; }
      assert.equal(state.view, 'quiz'); const q = data.questions.find(q => q.title === state.question); assert.ok(q);
      ids.push(q.id); answers[q.id] = answer(q, value(q, ids.length));
    }
    assert.fail('Flow exceeded ' + limit + ' visible actions');
  }
  function assertSeats() {
    assert.equal(query('#result-hemi').querySelectorAll('circle').length, 450);
    assert.equal(document.querySelectorAll('.party-rank-button').reduce((sum, n) => sum + Number(n.querySelector('b').textContent), 0), 450);
  }
  return {context, document, query, data, read, timers, selectTopics, setMode, answer, finish, assertSeats};
}

// Full questionnaire exercises every actual Next and board Continue callback.
let ui = appHarness(); ui.query('#start').click(); ui.setMode('full'); ui.query('#begin').click();
let run = ui.finish((q, n) => ((n * 17) % 201 - 100) / 100);
assert.equal(run.ids.length, 98); assert.equal(new Set(run.ids).size, 98); assert.equal(run.boards, 14); ui.assertSeats();
const expected = ui.context.window.PoliticsModel.calculate(ui.data.topics.map(() => 2), run.answers, ui.data.parties.map((_, i) => i));
for (const button of ui.document.querySelectorAll('.party-rank-button')) assert.equal(Number(button.querySelector('b').textContent), expected.totals[Number(button.dataset.party)]);
assert.equal(ui.query('#law-list').querySelectorAll('.law-card').length, 27);
assert.equal(ui.query('#law-timeline').querySelectorAll('[data-year]').length, 6);
ui.query('#scenario-timeline').value = '2026'; ui.query('#scenario-timeline').dispatch('input');
for (let i = 0; i < 6; i++) { assert.equal(ui.query('#indicator-value-' + i).textContent, '50'); assert.equal(ui.query('#indicator-cost-' + i).textContent, ''); }
ui.query('#scenario-timeline').value = '2031'; ui.query('#scenario-timeline').dispatch('input');
ui.query('#scenario-effort').value = '0'; ui.query('#scenario-effort').dispatch('input');
for (let i = 0; i < 6; i++) assert.equal(ui.query('#indicator-value-' + i).textContent, '50');
ui.query('#law-status').value = 'passed'; ui.query('#law-status').dispatch('change'); assert.ok(ui.query('#law-list').querySelector('.law-empty'));
ui.query('#scenario-effort').value = '70'; ui.query('#scenario-effort').dispatch('input'); ui.query('#law-status').value = 'all'; ui.query('#law-status').dispatch('change');
const link = ui.document.querySelector('[data-law-link]'); assert.ok(link); link.click(); assert.equal(ui.query('#law-' + link.dataset.lawLink).open, true);
ui.query('#scenario-whip').value = '90'; ui.query('#scenario-whip').dispatch('input'); assert.equal(ui.query('#law-' + link.dataset.lawLink).open, true);

// Moderate answers expand the four-question foreign-policy core exactly once.
ui = appHarness(); ui.query('#start').click(); ui.selectTopics({11:2}); ui.query('#begin').click();
assert.equal(ui.read().index, 0); run = ui.finish(() => 0);
assert.equal(run.ids.length, 10); assert.equal(new Set(run.ids).size, 10); assert.equal(run.boards, 1); ui.assertSeats();
ui.query('#edit-priorities').click(); ui.query('#begin').click(); assert.equal(ui.read().view, 'result');

// Reserve-only edits do not ask answered questions or insert the reserve twice.
ui = appHarness(); ui.query('#start').click(); ui.selectTopics({13:2}); ui.query('#begin').click(); run = ui.finish(() => 1);
assert.equal(run.ids.length, 4); const first = new Set(run.ids); ui.assertSeats();
ui.query('#edit-priorities').click(); ui.selectTopics({13:4}); ui.query('#begin').click(); run = ui.finish(() => 0);
assert.equal(run.ids.length, 4); assert.equal(new Set(run.ids).size, 4); assert.ok(run.ids.every(id => !first.has(id))); ui.assertSeats();
ui.query('#edit-priorities').click(); ui.selectTopics({13:4,11:2}); ui.query('#begin').click(); run = ui.finish(() => 0);
assert.equal(run.ids.length, 10); assert.equal(new Set(run.ids).size, 10); assert.ok(run.ids.every(id => ui.data.questions.find(q => q.id === id).topic === 11));
ui.query('#edit-priorities').click(); ui.query('#begin').click(); assert.equal(ui.read().view, 'result'); ui.assertSeats();

// Answers without comparative evidence reach the empty result through the UI.
for (const [topic, ids] of [[11, ['world-eu','world-nato']], [8, ['svo-demobilization']]]) {
  ui = appHarness(); ui.query('#start').click(); ui.setMode('full'); ui.selectTopics({[topic]:2}); ui.query('#begin').click();
  run = ui.finish(q => ids.includes(q.id) ? .6 : null);
  assert.equal(run.ids.length, ui.data.questions.filter(q => q.topic === topic).length);
  assert.ok(ui.query('#app').querySelector('.empty-state')); assert.equal(ui.document.querySelector('#scenario'), null);
}

// A non-prefix party selection exercises global IDs and fresh scenario handlers.
ui = appHarness(); ui.query('#start').click(); ui.selectTopics({0:2});
for (const checkbox of ui.document.querySelectorAll('.parties-list input')) checkbox.checked = ['3','6'].includes(checkbox.value);
ui.query('.parties-list').dispatch('change'); ui.query('#begin').click(); ui.finish((q,n) => n % 2 ? 1 : -1); ui.assertSeats();
assert.deepEqual(ui.document.querySelectorAll('[data-coalition-party]').map(b => Number(b.dataset.coalitionParty)), [3,6]);
for (const button of ui.document.querySelectorAll('[data-coalition-party]')) if (button.getAttribute('aria-pressed') !== 'true') button.click();
assert.match(ui.query('#scenario-status').textContent, /^450 из 450/);
const lastWeight = ui.query('#topic-results [data-topic="0"][data-level="0"]'); lastWeight.click();
assert.equal(ui.query('#topic-results [data-topic="0"][data-level="2"]').getAttribute('aria-checked'), 'true'); ui.assertSeats();
ui.query('#edit-priorities').click();
for (const checkbox of ui.document.querySelectorAll('.parties-list input')) checkbox.checked = checkbox.value === '6';
ui.query('.parties-list').dispatch('change'); ui.query('#begin').click(); assert.equal(ui.read().view, 'result'); ui.assertSeats();
assert.deepEqual(ui.document.querySelectorAll('[data-coalition-party]').map(b => Number(b.dataset.coalitionParty)), [6]);
ui.query('[data-coalition-party="6"]').click(); assert.match(ui.query('#scenario-status').textContent, /^0 из 450/);
ui.query('[data-coalition-party="6"]').click(); assert.match(ui.query('#scenario-status').textContent, /^450 из 450/);

// A party subset never changes the independent landing-page examples.
ui = appHarness(); ui.query('#start').click();
for (const checkbox of ui.document.querySelectorAll('.parties-list input')) checkbox.checked = checkbox.value === '6';
ui.query('.parties-list').dispatch('change'); ui.query('#home').click();
assert.equal(ui.query('#demo-hemi').querySelectorAll('circle').length, 450);
assert.equal(ui.query('#demo-hemi').querySelectorAll('circle title').length, 450);
assert.equal(ui.document.querySelectorAll('.legend span').length, 9);
assert.equal(ui.document.querySelector('.demo-pause'), null);
const label = ui.query('#demo-label').textContent; assert.equal(ui.timers.size, 1); [...ui.timers.values()][0](); assert.notEqual(ui.query('#demo-label').textContent, label);
assert.ok(!/undefined|NaN/.test(ui.query('#app').innerHTML));
console.log('Passed UI state flows: full 98 questions/14 boards/450 seats/27 laws, baseline and zero execution, law links/filters/open state, adaptive expansion, reserve-only edits, missing-evidence empty states, global coalition IDs/fresh result handlers/last-theme guard, independent continuous demo. No browser layout assertion.');
