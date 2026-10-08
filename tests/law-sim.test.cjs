const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engineSource = fs.readFileSync(`${__dirname}/../dist/law-sim.js`, 'utf8');
function engine(positions = [1, -1], secondPositions) {
  const parties = positions.map((_, i) => ({id: `p${i}`, short: `P${i}`}));
  const questions = [{id: 'policy', positions}];
  if (secondPositions) questions.push({id: 'other', positions: secondPositions});
  const ctx = {window: {PoliticsData: {parties, questions, totalSeats: 450, majority: 226}}};
  vm.createContext(ctx); vm.runInContext(engineSource, ctx);
  return ctx.window.LegislationModel;
}
function bill(id = 'proposal', changes = {}) {
  return {id, title: id, sponsors: ['p0'], year: 2027, questionTargets: {policy: 1}, impacts: {social: 10, business: -3}, budgetCost: 5, priority: .5, source: {url: 'https://example.test/program', title: 'Program', kind: 'initiative'}, ...changes};
}
function scenario(model, bills, changes = {}) {
  return model.simulate({enabled: [0, 1], totals: [226, 224], coalition: [], implementation: 1, discipline: 0, bills, ...changes});
}
function assertSeatAccounting(result) {
  for (const b of result.bills) {
    assert.equal(b.yesSeats + b.noSeats + b.abstainSeats, 450, b.id);
    for (const v of b.votes) assert.equal(v.yes + v.no + v.abstain, v.seats, `${b.id}/${v.party}`);
  }
}

// The threshold is absolute, and rejected bills cannot move indicators or spend resources.
let M = engine();
let r = scenario(M, [bill()], {throughYear: 2027});
assert.equal(r.bills[0].yesSeats, 226);
assert.equal(r.bills[0].status, 'passed');
assert.equal(r.effects.social, 4.5);
assert.equal(r.timeline[0].budget.spent, 5);
assertSeatAccounting(r);
r = scenario(M, [bill()], {totals: [225, 225], throughYear: 2027});
assert.equal(r.bills[0].status, 'rejected');
assert.equal(r.effects.social, 0);
assert.equal(r.timeline[0].budget.spent, 0);

// Unknown positions remain abstentions under maximum coalition discipline.
M = engine([1, null]);
r = scenario(M, [bill()], {coalition: [0, 1], discipline: 1, throughYear: 2027});
assert.equal(r.bills[0].votes[1].abstain, 224);
assert.equal(r.bills[0].votes[1].yes, 0);
assertSeatAccounting(r);
M = engine([null, null]);
r = scenario(M, [bill('modeled', {source: {kind: 'modeled', url: 'https://example.test'}})], {coalition: [0, 1], discipline: 1});
assert.equal(r.bills[0].yesSeats, 0);
assert.equal(r.bills[0].abstainSeats, 450);
M = engine([1, 1], [null, 1]);
r = scenario(M, [bill('partial', {sponsors: ['p1'], source: {kind: 'modeled'}, questionTargets: {policy: 1, other: 1}})], {throughYear: 2027});
assert.ok(r.bills[0].votes[0].abstain >= 113);
assertSeatAccounting(r);

// Discipline negotiates projects and increases support, while keeping dissent and all sums deterministic.
M = engine([-1, .8]);
const coalitionBill = bill('compromise', {questionTargets: {policy: -1}, budgetCost: 0});
const low = scenario(M, [coalitionBill], {totals: [170, 280], coalition: [0, 1], discipline: 0, throughYear: 2027});
const high = scenario(M, [coalitionBill], {totals: [170, 280], coalition: [0, 1], discipline: 1, throughYear: 2027});
assert.equal(low.bills[0].status, 'rejected');
assert.equal(high.bills[0].status, 'passed');
assert.ok(high.bills[0].amended);
assert.ok(high.bills[0].amendedTargets.policy < 0);
assert.ok(high.bills[0].amendedTargets.policy > -1);
assert.ok(high.bills[0].votes[1].no > 0);
assert.deepEqual(high, scenario(M, [coalitionBill], {totals: [170, 280], coalition: [0, 1], discipline: 1, throughYear: 2027}));
assertSeatAccounting(high);

// Costly legislation must wait for capacity; a passed funding priority can make room in the same year.
M = engine();
const expensive = bill('expensive', {budgetCost: 35});
r = scenario(M, [expensive], {throughYear: 2027});
assert.equal(r.bills[0].status, 'notScheduled');
assert.equal(r.bills[0].reasonCode, 'budget');
assert.equal(r.timeline[0].scheduled, 0);
assert.equal(r.effects.social, 0);
r = scenario(M, [expensive, bill('funding', {budgetCost: -12, impacts: {business: -4}})], {throughYear: 2027});
assert.equal(r.summary.passed, 2);
assert.equal(r.timeline[0].budget.raised, 12);
assert.equal(r.timeline[0].budget.remaining, 7);
for (const year of r.timeline) assert.ok(year.budget.remaining >= 0);

// Incompatible laws cannot apply together: replacement requires another year and another vote.
const first = bill('first', {group: 'course', policyDirection: 1, budgetCost: 0, priority: 1});
const opposite = bill('opposite', {group: 'course', policyDirection: -1, budgetCost: 0, priority: .1, impacts: {social: -8}});
r = scenario(M, [first, opposite], {throughYear: 2027});
assert.equal(r.bills[1].status, 'notScheduled');
assert.equal(r.bills[1].reasonCode, 'conflict');
const replaced = scenario(M, [first, opposite], {throughYear: 2029});
assert.equal(replaced.bills[0].repealedYear, 2028);
assert.equal(replaced.bills[0].active, false);
assert.equal(replaced.bills[1].replaces, 'first');
assert.equal(replaced.active.length, 1);
assert.equal(replaced.effects.social, -6);
assert.deepEqual(replaced.timeline[0], r.timeline[0]);
const supplemented = scenario(M, [first, bill('supplement', {group: 'course', policyDirection: 1, budgetCost: 0, priority: .7}), opposite], {throughYear: 2029});
assert.equal(supplemented.active.length, 1);
assert.equal(supplemented.summary.repealed, 2);
assert.deepEqual(Array.from(supplemented.bills[2].replacesIds), ['first', 'supplement']);
assert.equal(supplemented.effects.social, -6);

// Baseline/cutoffs have no future enactment; implementation zero leaves the 2026 country unchanged.
r = scenario(M, [bill('future', {year: 2028})], {throughYear: 2027});
assert.equal(r.bills[0].status, 'pending');
assert.equal(r.bills[0].attempts.length, 0);
assert.equal(r.summary.passed, 0);
assert.equal(r.scores.social, 50);
r = scenario(M, [bill()], {throughYear: 2026});
assert.equal(r.timeline.length, 0);
assert.equal(r.effects.social, 0);
r = scenario(M, [bill()], {implementation: 0, discipline: 1, coalition: [0, 1]});
assert.equal(r.summary.passed, 0);
assert.equal(r.effects.social, 0);
assert.ok(r.timeline.every(y => y.agendaCapacity === 0 && y.budget.spent === 0));
assert.ok(r.bills[0].attempts.every(a => a.reasonCode === 'implementation'));

// A small implementation can enact fewer proposals, and cumulative indices stay inside their stated bounds.
const many = Array.from({length: 14}, (_, i) => bill(`bill-${i}`, {budgetCost: 0, impacts: {social: 40, business: -40}}));
const slow = scenario(M, many, {implementation: .1, throughYear: 2027});
const fast = scenario(M, many, {implementation: 1, throughYear: 2027});
assert.equal(slow.summary.passed, 1);
assert.equal(fast.summary.passed, 8);
assert.equal(fast.effects.social, 40);
assert.equal(fast.effects.business, -40);
assert.ok(fast.indicators.every(v => v.value >= 10 && v.value <= 90));
assertSeatAccounting(fast);

// Global coalition ids are distinct from local enabled array positions; unrepresented parties have no agenda.
M = engine([1, -1, 1]);
r = scenario(M, [bill('third', {sponsors: ['p2']})], {enabled: [2, 1], totals: [300, 150], coalition: [2], discipline: 1, throughYear: 2027});
assert.equal(r.coalitionSeats, 300);
assert.equal(r.bills[0].votes[0].index, 2);
assert.equal(r.bills[0].votes[0].inCoalition, true);
assert.equal(r.bills[0].status, 'passed');
r = scenario(M, [bill('absent', {sponsors: ['p2']})], {throughYear: 2027});
assert.equal(r.bills[0].reasonCode, 'noSponsor');
r = scenario(M, [bill()], {totals: [226, 200], throughYear: 2027});
assert.equal(r.vacantSeats, 24);
assertSeatAccounting(r);
assert.throws(() => scenario(M, [bill()], {totals: [226, 225]}));
assert.throws(() => scenario(M, [bill()], {coalition: [2]}));
assert.throws(() => scenario(M, [bill()], {implementation: -1}));
assert.throws(() => scenario(M, [bill(), bill()]));

// Exercise the researched catalogue with real positions. Every year stays within agenda/resource limits,
// and extending the horizon cannot rewrite outcomes already seen at an earlier cutoff.
const integrated = {window: {}}; vm.createContext(integrated);
for (const name of ['data', 'bills', 'law-sim']) vm.runInContext(fs.readFileSync(`${__dirname}/../dist/${name}.js`, 'utf8'), integrated);
const D = integrated.window.PoliticsData, L = integrated.window.LegislationModel;
assert.equal(integrated.window.PoliticsBills.length, 27);
for (let sample = 0; sample < 18; sample++) {
  const enabled = D.parties.map((_, i) => i);
  const weights = enabled.map(i => 1 + (i * 17 + sample * 13) % 29);
  const raw = weights.map(w => w / weights.reduce((n, x) => n + x, 0) * 450);
  const totals = raw.map(Math.floor);
  raw.map((n, i) => ({i, r: n - totals[i]})).sort((a, b) => b.r - a.r || a.i - b.i).slice(0, 450 - totals.reduce((n, x) => n + x, 0)).forEach(x => totals[x.i]++);
  const opts = {enabled, totals, coalition: enabled.filter(i => (i + sample) % 3 !== 0), implementation: (sample % 6) / 5, discipline: (sample % 5) / 4};
  const full = L.simulate(opts), prefix = L.simulate({...opts, throughYear: 2028});
  assert.deepEqual(full.timeline.slice(0, 2), prefix.timeline);
  assertSeatAccounting(full);
  for (const b of full.bills) for (const [id, target] of Object.entries(b.proposalTargets)) {
    const amended = b.amendedTargets[id];
    assert.ok(Math.abs(amended) <= Math.abs(target), `${b.id}/${id}: amendment must not strengthen the proposed measure`);
    assert.ok(target === 0 ? amended === 0 : amended * target > 0, `${b.id}/${id}: amendment must preserve the proposal's direction`);
  }
  const enactedOnce = new Set();
  for (const year of full.timeline) {
    assert.ok(year.scheduled <= year.agendaCapacity);
    assert.ok(year.budget.remaining >= 0);
    assert.ok(year.budget.spent <= year.budget.opening + year.budget.raised + .001);
    for (const b of year.bills.filter(b => b.status === 'passed' || b.status === 'rejected')) {
      assert.ok(!enactedOnce.has(b.id)); enactedOnce.add(b.id);
      if (b.status === 'passed') assert.ok(b.yesSeats >= 226);
      else assert.ok(b.yesSeats < 226);
    }
  }
  assert.ok(full.indicators.every(v => v.value >= 10 && v.value <= 90));
}
const nlIndex = D.parties.findIndex(p => p.id === 'nl');
const liberalCoalition = [D.parties.findIndex(p => p.id === 'ppd'), nlIndex];
const negotiatedCatalogue = L.simulate({enabled: D.parties.map((_, i) => i), totals: [20, 20, 20, 20, 100, 210, 20, 20, 20], coalition: liberalCoalition, implementation: .7, discipline: .75});
const startups = negotiatedCatalogue.bills.find(b => b.id === 'nl-startups');
const regions = negotiatedCatalogue.bills.find(b => b.id === 'nl-regional-taxes');
assert.equal(startups.amendedTargets.pensions, startups.proposalTargets.pensions);
assert.equal(regions.amendedTargets['state-budget'], regions.proposalTargets['state-budget']);
console.log('Passed: legislative thresholds, evidence/abstentions, coalition compromise, deterministic voting, scarce agenda/funding, repeal/conflict, rollout/cutoffs, global indices and 450-seat accounting.');
