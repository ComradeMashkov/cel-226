'use strict';
window.BoardMotion = (() => {
  const running = new WeakMap();
  const sum = values => values.reduce((n, x) => n + x, 0);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const byTotal = (totals, enabled) => totals.map((_, i) => i).sort((a, b) => totals[b] - totals[a] || enabled[a] - enabled[b]);

  function sectorLayout(finalTotals, enabled) {
    const allocated = sum(finalTotals);
    const raw = finalTotals.map(n => allocated ? n / allocated * 450 : 0);
    const sizes = raw.map(Math.floor);
    if (allocated) raw.map((n, party) => ({party, remainder: n - sizes[party]}))
      .sort((a, b) => b.remainder - a.remainder || enabled[a.party] - enabled[b.party])
      .slice(0, 450 - sum(sizes)).forEach(({party}) => sizes[party]++);
    let start = 0;
    return sizes.map((size, party) => {
      const sector = {party, globalParty: enabled[party], start, size, end: start + size};
      start += size;
      return sector;
    });
  }

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
    const finalTotals = previous.map((n, party) => n + addition[party]);
    return {previous: [...previous], addition: [...addition], enabled: [...enabled], finalTotals, sectors: sectorLayout(finalTotals, enabled), turns, finalStart: cursor, duration: cursor + 400};
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

  function play({hemi, ranking, previous, addition, enabled, parties, reduced = false, message, finalMessage = '', onComplete}) {
    if (!hemi || !ranking || !Array.isArray(parties) || enabled.some(i => !parties[i])) throw Error('Не найден интерфейс подсчёта мест');
    running.get(ranking)?.cancel();
    const plan = createPlan({previous, addition, enabled});
    const circles = [...hemi.querySelectorAll('circle.seat')], big = hemi.querySelector('.big');
    if (circles.length < 450) throw Error('В полукруге должно быть 450 мест');
    let cancelled = false, completed = false, frame = null, start = null, previousState = null, lastPhase = null, reordered = false, follow = !reduced, scrolling = false;
    const stopFollowing = () => { follow = false; };
    const followEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const removeFollowingListeners = () => { if (typeof window.removeEventListener === 'function') followEvents.forEach(type => window.removeEventListener(type, stopFollowing)); };
    if (typeof window.addEventListener === 'function') followEvents.forEach(type => window.addEventListener(type, stopFollowing, {passive: true}));
    const stopMotion = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; follow = false;
      removeFollowingListeners();
      // Stop an outstanding native smooth scroll at its current position rather than continuing after a skip.
      if (scrolling && typeof window.scrollTo === 'function' && Number.isFinite(window.scrollY) && Number.isFinite(window.scrollX)) window.scrollTo({top: window.scrollY, left: window.scrollX, behavior: 'instant'});
      scrolling = false;
    };
    const complete = state => {
      if (completed || cancelled) return;
      completed = true;
      stopMotion();
      if (typeof onComplete === 'function') onComplete(state);
    };
    const controller = {
      cancel() { if (cancelled) return; cancelled = true; stopMotion(); },
      finish() {
        if (cancelled || completed) return;
        if (ranking.isConnected === false || hemi.isConnected === false) { controller.cancel(); return; }
        stopMotion();
        ranking.classList.add('board-reduced');
        const state = snapshot(plan, plan.duration);
        render(state);
        complete(state);
      }
    };
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
    // Reserve stable proportional sectors across the entire semicircle, including their empty space.
    const slotParties = circles.map(() => null), slotOffsets = circles.map(() => -1);
    plan.sectors.forEach(sector => {
      for (let i = sector.start; i < sector.end; i++) { slotParties[i] = sector.party; slotOffsets[i] = i - sector.start; }
    });
    const paintedOwners = circles.map(() => null);

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
            if (rect.top < 84 || rect.bottom > window.innerHeight - 72) { activeRow.scrollIntoView({behavior: 'smooth', block: 'center'}); scrolling = true; }
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
        circles.forEach((circle, i) => {
          const party = slotParties[i], owner = party !== null && slotOffsets[i] < state.totals[party] ? party : null;
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
        const active = state.active;
        circle.classList.toggle('board-seat-current', active !== null && slotParties[i] === active && slotOffsets[i] >= previous[active] && slotOffsets[i] < state.totals[active]);
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
    if (reduced) { const state = snapshot(plan, plan.duration); render(state); complete(state); return controller; }
    render(snapshot(plan, 0));
    function tick(now) {
      if (cancelled || completed) return;
      if (ranking.isConnected === false || hemi.isConnected === false) { controller.cancel(); return; }
      if (start === null) start = now;
      const state = snapshot(plan, now - start);
      render(state);
      if (state.done) complete(state);
      frame = !state.done && !cancelled && !completed ? requestAnimationFrame(tick) : null;
    }
    frame = requestAnimationFrame(tick);
    return controller;
  }
  return Object.freeze({play, createPlan, snapshot});
})();
