'use strict';
window.BoardMotion = (() => {
  const running = new WeakMap();
  const sum = values => values.reduce((n, x) => n + x, 0);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const byTotal = (totals, enabled) => totals.map((_, i) => i).sort((a, b) => totals[b] - totals[a] || enabled[a] - enabled[b]);

  function createPlan({previous, addition, enabled}) {
    if (![previous, addition, enabled].every(Array.isArray) || previous.length !== addition.length || enabled.length !== previous.length || new Set(enabled).size !== enabled.length || enabled.some(i => !Number.isInteger(i) || i < 0) || [...previous, ...addition].some(n => !Number.isInteger(n) || n < 0) || sum(previous) + sum(addition) > 450) throw Error('Некорректные данные подсчёта мест');
    let cursor = 450;
    const order = addition.map((_, i) => i).sort((a, b) => addition[a] - addition[b] || enabled[a] - enabled[b]);
    const turns = order.map((party, index) => {
      const amount = addition[party], largest = amount > 0 && index === order.length - 1;
      const duration = amount === 0 ? 350 : largest ? 950 : 650;
      const pause = amount === 0 ? 0 : largest ? 400 : 250;
      const turn = {party, globalParty: enabled[party], amount, largest, start: cursor, countEnd: cursor + duration, end: cursor + duration + pause};
      cursor = turn.end;
      return turn;
    });
    return {previous: [...previous], addition: [...addition], enabled: [...enabled], turns, finalStart: cursor, duration: cursor + 400};
  }

  // This temporal snapshot contains only arithmetic and timing, making sequential counting testable.
  function snapshot(plan, elapsed) {
    const time = Math.max(0, elapsed), totals = [...plan.previous], accrued = plan.addition.map(() => 0), shown = plan.addition.map(() => false);
    let phase = time < 450 ? 'start' : 'final', active = null, largest = false, progress = 0;
    let order = byTotal(totals, plan.enabled);
    for (const turn of plan.turns) {
      if (time < turn.start) break;
      shown[turn.party] = true;
      if (time >= turn.end) {
        accrued[turn.party] = turn.amount; totals[turn.party] += turn.amount;
        order = byTotal(totals, plan.enabled);
        continue;
      }
      active = turn.party; largest = turn.largest;
      progress = Math.min(1, (time - turn.start) / (turn.countEnd - turn.start));
      phase = turn.amount === 0 ? 'zero' : time < turn.countEnd ? 'count' : 'settle';
      const eased = 1 - (1 - progress) ** 3;
      accrued[turn.party] = progress === 1 ? turn.amount : Math.floor(turn.amount * eased);
      totals[turn.party] += accrued[turn.party];
      if (phase === 'settle') order = byTotal(totals, plan.enabled);
      break;
    }
    const done = time >= plan.duration;
    if (time >= plan.finalStart) { phase = done ? 'done' : 'final'; active = null; order = byTotal(totals, plan.enabled); }
    return {phase, active, largest, progress, totals, accrued, shown, order, total: sum(totals), done};
  }

  function play({hemi, ranking, previous, addition, enabled, parties, reduced = false, message, finalMessage = ''}) {
    if (!hemi || !ranking || !Array.isArray(parties) || enabled.some(i => !parties[i])) throw Error('Не найден интерфейс подсчёта мест');
    running.get(ranking)?.cancel();
    const plan = createPlan({previous, addition, enabled});
    const circles = [...hemi.querySelectorAll('circle.seat')], big = hemi.querySelector('.big');
    if (circles.length < sum(previous) + sum(addition)) throw Error('В полукруге недостаточно мест');
    let cancelled = false, frame = null, start = null, previousState = null, lastPhase = null, reordered = false, follow = !reduced;
    const stopFollowing = () => { follow = false; };
    const followEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const removeFollowingListeners = () => { if (typeof window.removeEventListener === 'function') followEvents.forEach(type => window.removeEventListener(type, stopFollowing)); };
    if (typeof window.addEventListener === 'function') followEvents.forEach(type => window.addEventListener(type, stopFollowing, {passive: true}));
    const controller = {cancel() { if (cancelled) return; cancelled = true; if (frame !== null) cancelAnimationFrame(frame); frame = null; removeFollowingListeners(); }};
    running.set(ranking, controller);
    ranking.classList.add('board-ranking');
    ranking.classList.toggle('board-reduced', reduced);
    ranking.setAttribute('role', 'list');
    ranking.setAttribute('aria-label', 'Распределение мест между партиями');
    ranking.setAttribute('aria-busy', reduced ? 'false' : 'true');
    ranking.setAttribute('style', `--board-count:${enabled.length}`);
    ranking.innerHTML = '<div class="board-rank-axis" aria-hidden="true"><span>Места в Думе</span><span>Большинство · 226</span></div>' + enabled.map((global, k) => {
      const p = parties[global];
      return `<div class="board-rank-row" data-board-party="${k}" role="listitem" aria-setsize="${enabled.length}" style="--party-color:${escape(p.color)}"><span class="board-rank-position"></span><span class="board-rank-name"><i class="board-rank-dot" aria-hidden="true"></i><b>${escape(p.short || p.name)}</b></span><span class="board-rank-badge">—</span><span class="board-rank-total">${previous[k]}</span><span class="board-rank-track" aria-hidden="true"><i class="board-rank-fill"></i><em></em></span></div>`;
    }).join('');
    const rows = enabled.map((_, k) => {
      const row = ranking.querySelector(`[data-board-party="${k}"]`);
      return {row, rank: row.querySelector('.board-rank-position'), badge: row.querySelector('.board-rank-badge'), total: row.querySelector('.board-rank-total'), fill: row.querySelector('.board-rank-fill')};
    });
    const titles = circles.map(circle => {
      if (!circle.querySelector('title')) circle.innerHTML = '<title>Место ещё не распределено</title>';
      return circle.querySelector('title');
    });
    // Preserve every already-coloured seat. New seats occupy the empty circles in turn order.
    const owners = [];
    previous.forEach((count, k) => { for (let i = 0; i < count; i++) owners.push(k); });
    const previousCount = owners.length;
    const paintedOwners = owners.map(k => k);
    for (let i = owners.length; i < circles.length; i++) paintedOwners.push(null);

    function render(state) {
      if (cancelled) return;
      const phaseKey = `${state.phase}:${state.active}`;
      if (phaseKey !== lastPhase) {
        ranking.setAttribute('data-board-phase', state.phase);
        rows.forEach(({row}, k) => {
          row.classList.toggle('is-active', state.active === k);
          row.classList.toggle('is-largest', state.active === k && state.largest);
          row.classList.toggle('is-zero', state.shown[k] && addition[k] === 0);
        });
        if (message) message.textContent = state.phase === 'start' ? 'Начинаем подсчёт: партии получают места по очереди.'
          : state.active !== null ? `${parties[enabled[state.active]].short || parties[enabled[state.active]].name}: ${addition[state.active] === 0 ? 'в этом блоке +0 мест' : `+${addition[state.active]} мест${state.largest ? ' — самый большой вклад блока' : ''}`}.`
          : finalMessage;
        lastPhase = phaseKey;
        if (state.active !== null && follow) {
          const activeRow = rows[state.active].row;
          if (typeof activeRow.getBoundingClientRect === 'function') {
            const rect = activeRow.getBoundingClientRect();
            if (rect.top < 84 || rect.bottom > window.innerHeight - 72) activeRow.scrollIntoView({behavior: 'smooth', block: 'center'});
          }
        }
      }
      state.order.forEach((k, rank) => {
        const {row, rank: rankNode, badge, total, fill} = rows[k];
        row.style.transform = `translateY(calc(${rank} * var(--board-row-step)))`;
        row.setAttribute('aria-posinset', rank + 1);
        row.setAttribute('aria-label', `${rank + 1}. ${parties[enabled[k]].name}: ${state.totals[k]} мест; вклад блока ${state.accrued[k]}.`);
        row.classList.toggle('has-majority', state.totals[k] >= 226);
        if (rankNode.textContent !== String(rank + 1)) rankNode.textContent = rank + 1;
        if (total.textContent !== String(state.totals[k])) total.textContent = state.totals[k];
        const badgeText = state.shown[k] ? `+${addition[k]}` : '—';
        if (badge.textContent !== badgeText) badge.textContent = badgeText;
        fill.style.width = `${Math.min(100, state.totals[k] / 226 * 100)}%`;
      });
      if (!previousState || state.total !== previousState.total) {
        const nextOwners = [...owners];
        plan.turns.forEach(turn => { for (let n = 0; n < state.accrued[turn.party]; n++) nextOwners.push(turn.party); });
        circles.forEach((circle, i) => {
          const owner = nextOwners[i] ?? null;
          if (paintedOwners[i] !== owner || !previousState) {
            circle.setAttribute('fill', owner === null ? 'var(--empty)' : parties[enabled[owner]].color);
            titles[i].textContent = owner === null ? 'Место ещё не распределено' : parties[enabled[owner]].name;
            paintedOwners[i] = owner;
          }
        });
        if (big) big.textContent = state.total;
        hemi.setAttribute('aria-label', `Парламент: ${enabled.map((global, k) => `${parties[global].name} — ${state.totals[k]} мест`).join('; ')}. Распределено ${state.total} из 450 мест.`);
      }
      if (!previousState || previousState.active !== state.active || previousState.total !== state.total) circles.forEach((circle, i) => {
        circle.classList.toggle('board-seat-current', i >= previousCount && state.active !== null && paintedOwners[i] === state.active);
      });
      if ((state.phase === 'final' || state.done) && !reordered) {
        ranking.setAttribute('aria-busy', 'false');
        // Native browsers expose appendChild. Existing nodes are moved, preserving identity and focus.
        if (typeof ranking.appendChild === 'function') state.order.forEach(k => ranking.appendChild(rows[k].row));
        reordered = true;
        removeFollowingListeners();
      }
      previousState = state;
    }
    if (reduced) { render(snapshot(plan, plan.duration)); return controller; }
    render(snapshot(plan, 0));
    function tick(now) {
      if (cancelled) return;
      if (ranking.isConnected === false || hemi.isConnected === false) { controller.cancel(); return; }
      if (start === null) start = now;
      const state = snapshot(plan, now - start);
      render(state);
      frame = !state.done && !cancelled ? requestAnimationFrame(tick) : null;
    }
    frame = requestAnimationFrame(tick);
    return controller;
  }
  return Object.freeze({play, createPlan, snapshot});
})();
