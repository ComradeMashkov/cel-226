const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx={window:{}};vm.createContext(ctx);
for(const name of ['data','model'])vm.runInContext(fs.readFileSync(`${__dirname}/../dist/${name}.js`,'utf8'),ctx);
const D=ctx.window.PoliticsData,M=ctx.window.PoliticsModel;
const enabled=D.parties.map((_,i)=>i),levels=D.topics.map(()=>2),sum=a=>a.reduce((a,b)=>a+b,0);
assert.equal(D.questions.length,98);
assert.equal(D.topics.length,14);
assert.equal(D.questions.filter(q=>q.core).length,72);
assert.equal(new Set(D.questions.map(q=>q.id)).size,98);
assert.equal(M.seatPositions.length,450);
for(const q of D.questions){assert.ok(q.costA&&q.costB,`${q.id} must show both tradeoffs`);assert.equal(q.positions.length,D.parties.length);assert.ok(q.positions.every(x=>x===null||Number.isFinite(x)&&x>=-1&&x<=1));}
// Allocation must preserve exactly 450 seats under varied priorities and skipped answers.
for(let seed=0;seed<60;seed++){
 const answers={};for(let i=0;i<D.questions.length;i++)if((i+seed)%7)answers[D.questions[i].id]=((i*17+seed*13)%201-100)/100;
 const weights=levels.map((_,i)=>(i+seed)%5);
 const result=M.calculate(weights,answers,enabled);
 assert.equal(sum(result.totals),450);assert.equal(sum(result.chunks),450);
 assert.ok(result.totals.every(x=>Number.isInteger(x)&&x>=0));
 result.parts.forEach((p,t)=>assert.equal(sum(p),result.chunks[t]));
}
// Unknown and no-opinion answers must never become a centre-position answer.
assert.equal(M.calculate(levels,{},enabled).allocated,0);
const allSkip=Object.fromEntries(D.questions.map(q=>[q.id,null]));assert.equal(M.calculate(levels,allSkip,enabled).allocated,0);
const hypothetical=D.questions.find(q=>q.id==='world-nato');assert.equal(M.questionShares(hypothetical,1,enabled),null);
const oneKnown=D.questions.find(q=>q.id==='svo-demobilization');assert.equal(M.questionShares(oneKnown,1,enabled),null);
assert.equal(M.calculate(levels,{[hypothetical.id]:1},enabled).allocated,0);
const unknown={...D.questions[0],positions:[-1,null,1]};
const unknownShares=M.questionShares(unknown,-1,[0,1,2]);
assert.ok(unknownShares[0]>unknownShares[1]&&unknownShares[1]>unknownShares[2]);
assert.ok(Math.abs(unknownShares[1]-1/3)<1e-12);
// Topic direction must not invert a preference when visual options are flipped.
const employment=D.questions.find(q=>q.id==='employment');
assert.equal(employment.d,-1);
const a=M.questionShares(employment,1,enabled),b=M.questionShares({...employment,d:1},-1,enabled);
assert.deepEqual(a,b);
// Disabling themes excludes their answers. A single selected party gets 450, when evidence exists.
const active=levels.map(()=>0);active[0]=2;
const r=M.calculate(active,{taxes:-1,'svo-negotiations':1},enabled);
assert.equal(r.chunks[0],450);assert.equal(sum(r.chunks.slice(1)),0);
assert.equal(M.calculate(active,{taxes:-1},[0]).totals[0],450);
// Coalitions must be winning and minimal: each member is necessary.
for(const totals of [[150,100,70,50,30,20,15,10,5],[250,50,40,30,20,20,15,15,10]]){
 const coalitions=M.coalitions(totals,enabled);assert.ok(coalitions.length);
 for(const c of coalitions){assert.ok(c.total>=226);assert.ok(c.members.every(k=>c.total-totals[k]<226));}
}
assert.throws(()=>M.apportion([-1,3],450));assert.throws(()=>M.questionShares(D.questions[0],2,enabled));
const scenario=M.scenario([150,100,70,50,30,20,15,10,5],enabled,[0,1],2026,1);
assert.ok(scenario.majority);assert.ok(scenario.indicators.every(x=>x.value===50&&x.delta===0));
const noImplementation=M.scenario([150,100,70,50,30,20,15,10,5],enabled,[0,1],2031,0);
assert.ok(noImplementation.indicators.every(x=>x.value===50));
console.log('Passed: 98 questions, 14 themes, 72-question core, 450-seat invariants, missing evidence, skipped answers, orientation and minimal coalitions.');
