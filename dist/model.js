'use strict';
window.PoliticsModel = (() => {
  const D=window.PoliticsData;
  function apportion(weights,total){
    if(!Number.isInteger(total)||total<0||weights.some(w=>!Number.isFinite(w)||w<0))throw Error('Некорректный набор весов');
    const sum=weights.reduce((a,b)=>a+b,0);
    if(!sum)return weights.map(()=>0);
    const raw=weights.map(w=>w/sum*total),seats=raw.map(Math.floor);
    const remainder=total-seats.reduce((a,b)=>a+b,0);
    raw.map((n,i)=>({i,remainder:n-seats[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i).slice(0,remainder).forEach(x=>seats[x.i]++);
    return seats;
  }
  function questionShares(question,answer,enabled){
    if(!Number.isFinite(answer)||Math.abs(answer)>1)throw Error('Ответ должен быть от −1 до 1');
    const supported=enabled.filter(i=>question.positions[i]!==null);
    if(!supported.length||(enabled.length>1&&supported.length<2))return null;
    const axis=answer*question.d;
    const distances=supported.map(i=>(axis-question.positions[i])**2),minimum=Math.min(...distances);
    const weights=new Map(supported.map((i,k)=>[i,Math.exp(-(distances[k]-minimum)/(2*D.sigma**2))]));
    const average=[...weights.values()].reduce((a,b)=>a+b,0)/supported.length;
    // Missing evidence receives the mean contribution, never an invented position at the centre.
    const all=enabled.map(i=>weights.get(i)??average),sum=all.reduce((a,b)=>a+b,0);
    return all.map(x=>x/sum);
  }
  function calculate(levels,answers,enabled,allowedTopics=null){
    const usable=D.topics.map((_,t)=>Object.entries(answers).some(([id,value])=>{
      const q=D.questions.find(q=>q.id===id);
      return q&&q.topic===t&&value!==null&&questionShares(q,value,enabled)!==null;
    }));
    const chunks=apportion(levels.map((level,t)=>usable[t]&&(!allowedTopics||allowedTopics.includes(t))?D.levels[level].weight:0),D.totalSeats);
    const coverage=enabled.map(()=>({known:0,total:0}));
    const parts=D.topics.map((_,t)=>{
      const scores=enabled.map(()=>0);
      D.questions.filter(q=>q.topic===t).forEach(q=>{
        const answer=answers[q.id];
        if(answer===undefined||answer===null||!chunks[t])return;
        const shares=questionShares(q,answer,enabled);if(!shares)return;
        shares.forEach((x,k)=>{scores[k]+=x;coverage[k].total++;if(q.positions[enabled[k]]!==null)coverage[k].known++;});
      });
      return apportion(scores,chunks[t]);
    });
    const totals=enabled.map((_,k)=>parts.reduce((n,p)=>n+p[k],0));
    return {chunks,parts,totals,usable,coverage,allocated:totals.reduce((a,b)=>a+b,0)};
  }
  function coalitions(totals,enabled){
    const result=[];
    for(let mask=1;mask<(1<<enabled.length);mask++){
      const members=enabled.map((_,k)=>k).filter(k=>mask&(1<<k));
      const total=members.reduce((s,k)=>s+totals[k],0);
      if(total>=D.majority&&members.every(k=>total-totals[k]<D.majority))result.push({members,total});
    }
    return result.sort((a,b)=>a.members.length-b.members.length||b.total-a.total).slice(0,3);
  }
  function positions(){
    const radii=Array.from({length:11},(_,i)=>78+i*11.7);
    const counts=apportion(radii,D.totalSeats),points=[];
    radii.forEach((r,row)=>{for(let j=0;j<counts[row];j++){const angle=Math.PI*(1-(j+.5)/counts[row]);points.push({x:225+r*Math.cos(angle),y:213-r*Math.sin(angle),angle,row});}});
    return points.sort((a,b)=>b.angle-a.angle||a.row-b.row);
  }
  function shuffle(a){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;}
  function scenario(totals,enabled,members,year=2031,implementation=.7){
    if(!Number.isFinite(year)||year<2026||year>2031||!Number.isFinite(implementation)||implementation<0||implementation>1)throw Error('Некорректные настройки сценария');
    const indices=[...new Set(members)].filter(k=>Number.isInteger(k)&&k>=0&&k<enabled.length),seats=indices.reduce((n,k)=>n+totals[k],0);
    function axis(topics){let value=0,weight=0;for(const k of indices){const qs=D.questions.filter(q=>topics.includes(q.topic)&&q.positions[enabled[k]]!==null);if(!qs.length)continue;const average=qs.reduce((n,q)=>n+q.positions[enabled[k]],0)/qs.length;value+=average*totals[k];weight+=totals[k];}return weight?value/weight:0;}
    const progress=(year-2026)/5*implementation;
    const scores=[-axis([0,1]),axis([0]),-axis([2,10]),-axis([11,12]),axis([13]),axis([8])];
    const indicators=scores.map(score=>({value:50+40*score*progress,target:50+40*score,delta:40*score*progress}));
    const questions=D.questions.map(q=>{const values=indices.filter(k=>q.positions[enabled[k]]!==null).map(k=>({party:enabled[k],value:q.positions[enabled[k]]}));const spread=values.length>1?Math.max(...values.map(x=>x.value))-Math.min(...values.map(x=>x.value)):0;return {id:q.id,title:q.title,values,spread};}).filter(q=>q.spread>.7).sort((a,b)=>b.spread-a.spread).slice(0,3);
    return {seats,majority:seats>=D.majority,indicators,compromises:questions};
  }
  return {apportion,questionShares,calculate,coalitions,scenario,seatPositions:positions(),shuffle};
})();
