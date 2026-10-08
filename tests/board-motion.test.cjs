const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/../dist/board-motion.js`, 'utf8');

// A purpose-built DOM fixture tests seat/row identity and cancellation, not browser layout.
class Node {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag; this.attrs = {...attrs}; this.children = []; this.style = {}; this.isConnected = true; this.textContent = '';
    this.classList = {
      add: name => this.classList.toggle(name, true),
      contains: name => (this.attrs.class || '').split(' ').includes(name),
      toggle: (name, force) => { const set = new Set((this.attrs.class || '').split(' ').filter(Boolean)); const add = force ?? !set.has(name); add ? set.add(name) : set.delete(name); this.attrs.class = [...set].join(' '); }
    };
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  appendChild(node) { this.children = this.children.filter(n => n !== node); this.children.push(node); }
  querySelectorAll(selector) {
    const found = [];
    const match = node => selector === 'circle.seat' ? node.tagName === 'circle' && node.classList.contains('seat')
      : selector.startsWith('.') ? node.classList.contains(selector.slice(1))
      : selector.startsWith('[data-board-party=') ? node.attrs['data-board-party'] === selector.match(/"(\d+)"/)[1]
      : node.tagName === selector;
    const visit = node => node.children.forEach(child => { if (match(child)) found.push(child); visit(child); }); visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  set innerHTML(html) {
    this.children = [];
    if (html.startsWith('<title>')) { const title = new Node('title'); title.textContent = html.replace(/<\/?title>/g, ''); this.children.push(title); return; }
    const axis = new Node('div', {class: 'board-rank-axis'}); this.children.push(axis);
    for (const [, index] of html.matchAll(/data-board-party="(\d+)"/g)) {
      const row = new Node('div', {class: 'board-rank-row', 'data-board-party': index});
      for (const name of ['board-rank-position', 'board-rank-name', 'board-rank-badge', 'board-rank-total', 'board-rank-fill']) row.children.push(new Node('span', {class: name}));
      this.children.push(row);
    }
  }
}
function fixture() {
  const queue = new Map(), callbacks = new Map(), listeners = new Map(); let id = 0;
  const context = {window: {innerHeight: 600,
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); }
  }, requestAnimationFrame(callback) { queue.set(++id, callback); callbacks.set(id, callback); return id; }, cancelAnimationFrame(id) { queue.delete(id); }};
  vm.createContext(context); vm.runInContext(source, context);
  const hemi = new Node('svg');
  for (let k = 0; k < 450; k++) hemi.children.push(new Node('circle', {class: 'seat', fill: 'empty', cx: `${k}`}));
  hemi.children.push(new Node('text', {class: 'big'}));
  const ranking = new Node(), message = new Node();
  const parties = Array.from({length: 9}, (_, i) => ({name: `Party ${i}`, short: `P${i}`, color: `color-${i}`}));
  return {M: context.window.BoardMotion, hemi, ranking, message, parties, queue, callbacks,
    listenerCount() { return [...listeners.values()].reduce((n, handlers) => n + handlers.size, 0); },
    dispatch(type) { listeners.get(type)?.forEach(handler => handler()); },
    step(time) { assert.equal(queue.size, 1, 'only one animation frame may be pending'); const [key, callback] = [...queue][0]; queue.delete(key); callback(time); },
    dump() { return JSON.stringify({svg: hemi.children.map(n => ({attrs: n.attrs, text: n.textContent, titles: n.children.map(t => t.textContent)})), svgAttrs: hemi.attrs, rows: ranking.children.map(n => ({attrs: n.attrs, style: n.style, contents: n.children.map(c => c.textContent)})), rankingAttrs: ranking.attrs, message: message.textContent}); }
  };
}
let f = fixture();
const inputs = {previous: [80, 90, 0], addition: [15, 0, 30], enabled: [6, 3, 1]};
const plan = f.M.createPlan(inputs);
assert.deepEqual(Array.from(plan.turns, x => x.party), [1, 0, 2]);
assert.equal(plan.turns[0].end - plan.turns[0].start, 350);
assert.equal(plan.turns[1].countEnd - plan.turns[1].start, 650);
assert.equal(plan.turns[2].countEnd - plan.turns[2].start, 950);
assert.equal(plan.duration, 3450);
let previous = inputs.previous, lastTotal = 170;
for (let time = 0; time <= plan.duration + 100; time += 25) {
  const state = f.M.snapshot(plan, time);
  const changed = state.totals.map((n, i) => n !== previous[i] ? i : -1).filter(i => i !== -1);
  assert.ok(changed.length <= 1, 'only the current party receives seats');
  if (changed.length) assert.equal(changed[0], state.active ?? plan.turns.at(-1).party);
  assert.ok(state.total >= lastTotal && state.total <= 215);
  assert.equal(state.totals[1], 90, 'zero-addition turn must leave its total unchanged');
  previous = state.totals; lastTotal = state.total;
}
let state = f.M.snapshot(plan, plan.turns[1].countEnd - 1);
assert.deepEqual(Array.from(state.order), [1, 0, 2], 'rows wait for a completed turn before reordering');
state = f.M.snapshot(plan, plan.duration);
assert.deepEqual(Array.from(state.totals), [95, 90, 30]);
assert.deepEqual(Array.from(state.order), [0, 1, 2]);
assert.equal(state.done, true);
assert.throws(() => f.M.createPlan({previous: [450], addition: [1], enabled: [0]}));
assert.throws(() => f.M.createPlan({previous: [0, 0], addition: [1, 2], enabled: [0, 0]}));

// Production rendering preserves all circle objects and previously allocated owners.
const circles = [...f.hemi.querySelectorAll('circle.seat')];
const control = f.M.play({...inputs, ...f});
const rows = [0, 1, 2].map(i => f.ranking.querySelector(`[data-board-party="${i}"]`));
f.step(0);
f.step(plan.turns[1].start + 325);
assert.equal(f.message.textContent, 'P6: +15 мест.');
assert.equal(f.hemi.querySelectorAll('circle.seat')[80], circles[80]);
assert.equal(circles[79].getAttribute('fill'), 'color-6');
assert.equal(circles[80].getAttribute('fill'), 'color-3');
assert.equal(circles[169].getAttribute('fill'), 'color-3');
assert.equal(circles[170].getAttribute('fill'), 'color-6', 'new seats belong to the current party rather than displacing old owners');
f.step(plan.duration);
assert.equal(f.queue.size, 0);
assert.equal(f.hemi.querySelector('.big').textContent, 215);
assert.equal(circles[214].getAttribute('fill'), 'color-1');
assert.equal(circles[215].getAttribute('fill'), 'var(--empty)');
assert.equal(f.ranking.querySelector('[data-board-party="0"]'), rows[0]);
assert.equal(f.ranking.getAttribute('aria-busy'), 'false');
assert.deepEqual(f.ranking.children.filter(n => n.classList.contains('board-rank-row')), rows);
assert.equal(rows[0].getAttribute('aria-posinset'), '1');
control.cancel();

// Final native DOM order follows rank while reusing exactly the same row nodes.
f = fixture();
const swapped = {previous: [5, 100, 20], addition: [0, 0, 120], enabled: [8, 0, 6]};
f.M.play({...f, ...swapped, finalMessage: 'Final', reduced: true});
assert.equal(f.queue.size, 0, 'reduced motion must never request an animation frame');
assert.equal(f.message.textContent, 'Final');
assert.equal(f.hemi.querySelector('.big').textContent, 245);
assert.deepEqual(f.ranking.children.filter(n => n.classList.contains('board-rank-row')).map(n => n.attrs['data-board-party']), ['2', '1', '0']);
assert.equal(f.ranking.querySelector('[data-board-party="2"]').querySelector('.board-rank-fill').style.width, `${140 / 226 * 100}%`);
f = fixture();
f.M.play({...f, previous: [220, 0], addition: [80, 0], enabled: [0, 1], reduced: true});
const majorityRow = f.ranking.querySelector('[data-board-party="0"]');
assert.equal(majorityRow.querySelector('.board-rank-fill').style.width, '100%');
assert.ok(majorityRow.classList.contains('has-majority'));
assert.equal(majorityRow.querySelector('.board-rank-total').textContent, 300);
assert.equal(f.hemi.querySelector('.big').textContent, 300);

// Cancellation, replay and a removed view block even an already-delivered stale callback.
f = fixture();
const paused = f.M.play({...f, ...inputs});
const stale = [...f.queue.values()][0];
f.step(0); f.step(1000); paused.cancel();
const cancelledDump = f.dump(); stale(6000);
assert.equal(f.dump(), cancelledDump);
assert.equal(f.queue.size, 0);
const replay = f.M.play({...f, ...inputs});
const replayStale = [...f.queue.values()][0];
f.M.play({...f, ...inputs, reduced: true, finalMessage: 'Replayed'});
const replayedDump = f.dump(); replayStale(9000);
assert.equal(f.dump(), replayedDump);
assert.equal(f.queue.size, 0);
replay.cancel();
f = fixture(); f.M.play({...f, ...inputs});
f.ranking.isConnected = false; const disconnectedDump = f.dump(); f.step(0);
assert.equal(f.dump(), disconnectedDump); assert.equal(f.queue.size, 0);
assert.equal(f.listenerCount(), 0);

// Auto-follow exposes an off-screen party, then yields to manual interaction.
f = fixture();
const followControl = f.M.play({...f, ...inputs});
const followed = [];
[0, 1, 2].forEach(i => {
  const row = f.ranking.querySelector(`[data-board-party="${i}"]`);
  row.getBoundingClientRect = () => ({top: 800, bottom: 844});
  row.scrollIntoView = options => followed.push({party: i, behavior: options.behavior, block: options.block});
});
assert.equal(f.listenerCount(), 4);
f.step(0); f.step(plan.turns[0].start);
assert.deepEqual(followed, [{party: 1, behavior: 'smooth', block: 'center'}]);
f.step(plan.turns[0].start + 50);
assert.equal(followed.length, 1, 'counting frames must not repeatedly restart scroll');
f.dispatch('wheel');
f.step(plan.turns[1].start);
assert.equal(followed.length, 1, 'manual scrolling stops auto-follow without stopping the count');
f.step(plan.duration);
assert.equal(f.hemi.querySelector('.big').textContent, 215);
assert.equal(f.listenerCount(), 0, 'completed counts must release follow listeners');
followControl.cancel();
f = fixture();
const cancelledFollow = f.M.play({...f, ...inputs}); cancelledFollow.cancel();
assert.equal(f.listenerCount(), 0, 'cancelled counts must release follow listeners');
f.M.play({...f, ...inputs, reduced: true});
assert.equal(f.listenerCount(), 0, 'reduced motion leaves no auto-follow listeners');
console.log('Passed: sequential party turns, zero/max timing, monotonic totals, stable old seat owners and row/circle identity, final DOM/ARIA order, reduced motion, one-rAF, cancellation/replay/removal guards and auto-follow/manual-scroll cleanup.');
