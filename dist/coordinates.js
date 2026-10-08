'use strict';
window.PoliticalCoordinates = (() => {
  const D = window.PoliticsData;
  const axes = [
    {id: 'economy', name: 'Левые / правые', topics: [0, 1], low: 'Левые', high: 'Правые', exclude: []},
    {id: 'power', name: 'Либерализм / авторитаризм', topics: [10], low: 'Либерализм', high: 'Авторитаризм', exclude: ['state-mayors', 'state-digital-vote']}
  ];
  const axisById = new Map(axes.map(a => [a.id, a]));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const valid = n => Number.isFinite(n) && Math.abs(n) <= 1;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const average = values => values.length ? values.reduce((n, v) => n + v, 0) / values.length : null;
  const coordinateText = value => {
    if (value === null) return 'Нет данных';
    const rounded = Math.round(value * 100);
    return `${rounded > 0 ? '+' : ''}${rounded}`;
  };
  const questionsFor = axis => D.questions.filter(q => axis.topics.includes(q.topic) && !axis.exclude.includes(q.id));
  let instance = 0;

  function summarize(axis, rows, valueFor) {
    const topicValues = [], byTopic = [];
    let known = 0;
    for (const topic of axis.topics) {
      const selected = rows.filter(q => q.topic === topic), values = selected.map(valueFor).filter(valid);
      known += values.length;
      const value = average(values);
      byTopic.push({topic, known: values.length, total: selected.length, value});
      if (value !== null) topicValues.push(value);
    }
    return {value: average(topicValues), known, total: rows.length, available: questionsFor(axis).length, byTopic, topicsKnown: topicValues.length, topicsTotal: axis.topics.length};
  }

  function labelPositions(points) {
    const occupied = [];
    const positioned = [];
    const overlaps = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    // Labels move; the actual coordinates remain fixed, including coincident party points.
    for (const point of [...points].sort((a, b) => Number(b.user) - Number(a.user) || a.index - b.index)) {
      const width = Math.max(22, point.label.length * 7 + 6), height = 17;
      let best = null;
      for (const radius of [17, 30, 46, 64, 83, 103]) for (const angle of [-.65, -2.5, .65, 2.5, -Math.PI / 2, Math.PI / 2, 0, Math.PI]) {
        const dx = Math.cos(angle) * radius, dy = Math.sin(angle) * radius;
        const anchor = dx < -5 ? 'end' : dx > 5 ? 'start' : 'middle';
        let x = point.x + dx, y = clamp(point.y + dy, 72, 460);
        const offset = anchor === 'end' ? width : anchor === 'middle' ? width / 2 : 0;
        x = clamp(x, 75 + offset, 605 - width + offset);
        const rect = {left: x - offset, right: x - offset + width, top: y - 13, bottom: y + height - 13};
        let penalty = occupied.reduce((n, previous) => n + overlaps(rect, previous) * 15, 0);
        points.forEach(other => { penalty += overlaps(rect, {left: other.x - 11, right: other.x + 11, top: other.y - 11, bottom: other.y + 11}) * 8; });
        penalty += Math.hypot(x - point.x, y - point.y) * .08;
        if (!best || penalty < best.penalty) best = {x, y, anchor, rect, penalty};
      }
      occupied.push(best.rect);
      positioned.push({...point, labelX: best.x, labelY: best.y, anchor: best.anchor});
    }
    return positioned;
  }

  function mount(root, getState) {
    if (!root || typeof getState !== 'function') throw Error('Для карты нужны контейнер и текущее состояние теста');
    const id = ++instance;
    const xId = 'economy', yId = 'power';
    let chosenScope = null, selected = 'user', selectionChosen = false, destroyed = false;
    let current = null;

    function read() {
      const state = getState() || {}, answers = state.answers || {};
      const answeredQuestion = q => valid(answers[q.id]) && (!Array.isArray(state.levels) || (state.levels[q.topic] ?? 0) > 0);
      const answered = D.questions.filter(answeredQuestion);
      const hasAnswers = answered.length > 0;
      const scope = hasAnswers ? chosenScope || 'answered' : 'all';
      const xAxis = axisById.get(xId), yAxis = axisById.get(yId);
      const allX = questionsFor(xAxis), allY = questionsFor(yAxis);
      const xRows = scope === 'answered' ? allX.filter(answeredQuestion) : allX;
      const yRows = scope === 'answered' ? allY.filter(answeredQuestion) : allY;
      const userX = summarize(xAxis, allX, q => answeredQuestion(q) ? answers[q.id] * q.d : null);
      const userY = summarize(yAxis, allY, q => answeredQuestion(q) ? answers[q.id] * q.d : null);
      const userReady = userX.known >= 2 && userY.known >= 2;
      const partyValues = D.parties.map((party, index) => ({party, index, x: summarize(xAxis, xRows, q => q.positions[index]), y: summarize(yAxis, yRows, q => q.positions[index]), enabled: (state.enabled || []).includes(index)}));
      return {state, hasAnswers, answered, scope, xAxis, yAxis, xRows, yRows, userX, userY, userReady, partyValues};
    }

    function userMissing(data) {
      const missing = [];
      if (data.userX.known < 2) missing.push(`по горизонтали «${data.xAxis.name}» — ещё ${2 - data.userX.known}`);
      if (data.userY.known < 2) missing.push(`по вертикали «${data.yAxis.name}» — ещё ${2 - data.userY.known}`);
      return missing.length ? `Чтобы показать вашу точку, нужны ответы: ${missing.join('; ')}. Пропуск не считается ответом в центре шкалы.` : '';
    }

    function axisReadout(axis, value, isUser, coordinate) {
      const coverage = isUser ? `Ответов ${value.known} из ${value.available}` : `Известных позиций ${value.known} из ${value.total}`;
      return `<div class="coordinate-axis-readout"><span>${coordinate} · ${escape(axis.name)}</span><b>${coordinateText(value.value)}${value.value === null ? '' : ' / 100'}</b><small>${escape(axis.low)} ↔ ${escape(axis.high)}</small><small>${coverage} · тем с данными ${value.topicsKnown} из ${value.topicsTotal}</small></div>`;
    }

    function detailsHTML(data) {
      if (selected === 'user') {
        return `<h4>Вы на карте</h4><div class="coordinate-axis-values">${axisReadout(data.xAxis, data.userX, true, 'X')}${axisReadout(data.yAxis, data.userY, true, 'Y')}</div><p>Ваши координаты — среднее по ответам выбранных тем. Положительные приоритеты тем на положение точки не влияют.</p>`;
      }
      const value = data.partyValues[Number(selected)], party = value.party;
      const url = /^https?:\/\//.test(party.source || '') ? party.source : '';
      const missing = [value.x.value === null ? `X · ${data.xAxis.name}` : '', value.y.value === null ? `Y · ${data.yAxis.name}` : ''].filter(Boolean);
      return `<h4>${escape(party.name)}</h4><p>${escape(party.description)}</p>${missing.length ? `<p class="coordinates-empty">Точка не показана: нет данных для ${escape(missing.join(' и '))}.</p>` : ''}<div class="coordinate-axis-values">${axisReadout(data.xAxis, value.x, false, 'X')}${axisReadout(data.yAxis, value.y, false, 'Y')}</div>${value.enabled || !data.hasAnswers ? '' : '<p>Эта партия не участвовала в вашем подсчёте мест; её профиль доступен для сравнения.</p>'}${url ? `<p class="coordinate-source"><a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(party.sourceTitle || 'Источник партийного профиля')} ↗</a></p>` : ''}<p class="coordinate-source">${escape(party.sourceNote || '')}</p>`;
    }

    function chartHTML(data) {
      const toX = value => 70 + (value + 1) * 270;
      const toY = value => 55 + (1 - value) * 205;
      const points = data.partyValues.filter(p => p.x.value !== null && p.y.value !== null).map(p => ({index: p.index, label: p.party.short || p.party.name, x: toX(p.x.value), y: toY(p.y.value), color: p.party.color, user: false}));
      if (data.userReady) points.push({index: -1, label: 'Вы', x: toX(data.userX.value), y: toY(data.userY.value), color: 'var(--accent)', user: true});
      const positioned = labelPositions(points);
      const ticks = [-100, -50, 0, 50, 100];
      const grid = ticks.map(t => `<line class="${t === 0 ? 'coordinate-axis' : 'coordinate-grid'}" x1="${toX(t / 100)}" y1="55" x2="${toX(t / 100)}" y2="465"/><line class="${t === 0 ? 'coordinate-axis' : 'coordinate-grid'}" x1="70" y1="${toY(t / 100)}" x2="610" y2="${toY(t / 100)}"/><text class="coordinate-tick" x="${toX(t / 100)}" y="483" text-anchor="middle">${t}</text><text class="coordinate-tick" x="57" y="${toY(t / 100) + 4}" text-anchor="end">${t}</text>`).join('');
      const labels = positioned.map(p => `<line class="coordinate-leader" x1="${p.x.toFixed(2)}" y1="${p.y.toFixed(2)}" x2="${p.labelX.toFixed(2)}" y2="${(p.labelY - 5).toFixed(2)}" aria-hidden="true"/><text class="${p.user ? 'coordinate-user-label' : 'coordinate-label'}" x="${p.labelX.toFixed(2)}" y="${p.labelY.toFixed(2)}" text-anchor="${p.anchor}" aria-hidden="true">${escape(p.label)}</text>`).join('');
      const markers = positioned.sort((a, b) => Number(a.user) - Number(b.user) || Number(String(a.index) === selected) - Number(String(b.index) === selected)).map(p => {
        const active = p.user ? selected === 'user' : selected === String(p.index);
        const target = p.user ? 'data-coordinate-user="true"' : `data-coordinate-party="${p.index}"`;
        const name = p.user ? 'Вы' : D.parties[p.index].name;
        const value = p.user ? {x: data.userX, y: data.userY} : data.partyValues[p.index];
        const shape = p.user ? '<circle r="13" fill="var(--surface)"/><path d="M0-7 2-2 7-2 3 1 4.5 6 0 3-4.5 6-3 1-7-2-2-2Z" fill="var(--accent)"/>' : `<circle r="${active ? 10 : 8}" fill="${escape(p.color)}"/>`;
        return `<g class="coordinate-point${p.user ? ' coordinate-user' : ''}${active ? ' is-selected' : ''}" transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})" role="button" tabindex="0" aria-pressed="${active}" ${target} aria-label="${escape(name)}: X ${coordinateText(value.x.value)}, Y ${coordinateText(value.y.value)}"><title>${escape(name)} · X ${coordinateText(value.x.value)} · Y ${coordinateText(value.y.value)}</title>${shape}</g>`;
      }).join('');
      const mapLabel = `Политические координаты. Горизонталь: ${data.xAxis.name}. Вертикаль: ${data.yAxis.name}. Диапазон от минус 100 до плюс 100.`;
      return `<svg class="coordinates-map" viewBox="0 0 680 540" role="group" aria-label="${escape(mapLabel)}"><rect class="coordinate-grid" x="70" y="55" width="540" height="410" fill="none"/>${grid}<text class="coordinate-axis-label" x="340" y="29" text-anchor="middle">${escape(data.yAxis.high)}</text><text class="coordinate-axis-label" x="340" y="508" text-anchor="middle">${escape(data.yAxis.low)}</text><text class="coordinate-axis-label" x="70" y="531" text-anchor="start">${escape(data.xAxis.low)}</text><text class="coordinate-axis-label" x="610" y="531" text-anchor="end">${escape(data.xAxis.high)}</text>${labels}${markers}</svg>`;
    }

    function render() {
      if (destroyed) return;
      const focused = root.ownerDocument?.activeElement;
      const methodOpen = root.querySelector('.coordinates-method')?.open;
      let focusSelector = null;
      if (focused && root.contains(focused)) {
        if (focused.hasAttribute('data-coordinate-scope')) focusSelector = '[data-coordinate-scope]';
        else if (focused.hasAttribute('data-coordinate-user')) focusSelector = `${focused.classList.contains('coordinate-point') ? '.coordinate-point' : '.coordinate-party-button'}[data-coordinate-user]`;
        else if (focused.hasAttribute('data-coordinate-party')) focusSelector = `${focused.classList.contains('coordinate-point') ? '.coordinate-point' : '.coordinate-party-button'}[data-coordinate-party="${focused.getAttribute('data-coordinate-party')}"]`;
        else if (focused.tagName === 'SUMMARY') focusSelector = '.coordinates-method summary';
      }
      current = read();
      const data = current;
      if (!selectionChosen) selected = data.hasAnswers ? 'user' : String(data.partyValues.find(p => p.x.value !== null && p.y.value !== null)?.index ?? 0);
      if (selected !== 'user' && !data.partyValues[Number(selected)]) selected = 'user';
      const unavailable = data.partyValues.filter(p => p.x.value === null || p.y.value === null);
      const userButton = data.hasAnswers ? `<button class="coordinate-party-button coordinate-user-button" type="button" data-coordinate-user="true" aria-pressed="${selected === 'user'}" style="--coordinate-color:var(--accent)"><b>★ Вы</b><small>${data.userReady ? `X ${coordinateText(data.userX.value)} · Y ${coordinateText(data.userY.value)}` : 'Нужны ответы по обеим осям'}</small></button>` : '';
      root.innerHTML = `<div class="coordinates-box"><div class="coordinates-heading"><h3>${data.hasAnswers ? 'Вы и партии на компасе' : 'Политический компас'}</h3><p>Слева — левые, справа — правые. Вверху — авторитаризм, внизу — либерализм.</p></div><div class="coordinates-controls"><label class="coordinates-control" for="coordinate-scope-${id}"><span>Набор вопросов для партий</span><select id="coordinate-scope-${id}" data-coordinate-scope="true"><option value="answered"${data.scope === 'answered' ? ' selected' : ''}${data.hasAnswers ? '' : ' disabled'}>Ваши вопросы</option><option value="all"${data.scope === 'all' ? ' selected' : ''}>Все вопросы</option></select></label></div>${data.hasAnswers && !data.userReady ? `<p class="coordinates-empty">${escape(userMissing(data))}</p>` : ''}<div class="coordinates-layout"><div class="coordinates-map-wrap">${chartHTML(data)}${unavailable.length ? `<p class="coordinates-empty">Нет данных для точки на обеих осях: ${unavailable.map(p => escape(p.party.short)).join(', ')}. Профили можно открыть в списке.</p>` : ''}</div><div class="coordinates-sidebar"><div class="coordinates-party-list" aria-label="Выбор профиля на карте">${userButton}${data.partyValues.map(p => `<button class="coordinate-party-button" type="button" data-coordinate-party="${p.index}" aria-pressed="${selected === String(p.index)}" style="--coordinate-color:${escape(p.party.color)}"><b>${escape(p.party.short)}</b><small>${p.x.value === null || p.y.value === null ? 'Недостаточно данных для точки' : `X ${coordinateText(p.x.value)} · Y ${coordinateText(p.y.value)}`}</small></button>`).join('')}</div><div class="coordinates-details" aria-live="polite">${detailsHTML(data)}</div></div></div><p class="coordinates-note">Карта описывает позиции, а не важность тем. Нажмите на точку или партию, чтобы увидеть координаты, покрытие вопросов и источник профиля.</p><details class="coordinates-method"><summary>Как построены координаты</summary><p>Шкалы идут от −100 до +100. Сначала считаем среднее по известным ответам внутри каждой темы, затем среднее доступных тем с равным весом. У пользователя учитываются ответы только выбранных тем; положительные приоритеты не меняют координаты. Неизвестная позиция и пропущенный ответ не становятся центром шкалы.</p><p>«Все вопросы» показывает полный известный профиль партии. «Ваши вопросы» оставляет для партий только вопросы, на которые вы ответили; недостающие партийные позиции пропускаются. Поэтому покрытие у партий может отличаться. Для вашей точки нужны хотя бы два ответа по каждой оси компаса.</p><p>Экономическая ось использует вопросы экономики и социальной политики: роль государства, гарантий и рынка. Вертикальная ось использует шесть вопросов: участие в выборах, полномочия президента, независимость суда, интернет, мирные собрания и участие в бюджетных решениях. Региональное устройство в эту ось не входит.</p><p>Оценки партий взяты из авторского профиля теста. Подписи разведены для чтения, сами точки остаются на рассчитанных координатах.</p><div class="coordinate-question-list"><b>Вопросы компаса</b><p>X · ${questionsFor(data.xAxis).map(q => escape(q.title)).join(' · ')}</p><p>Y · ${questionsFor(data.yAxis).map(q => escape(q.title)).join(' · ')}</p></div></details></div>`;
      if (methodOpen) root.querySelector('.coordinates-method').open = true;
      if (focusSelector) root.querySelector(focusSelector)?.focus?.();
    }

    function choose(event) {
      if (destroyed) return;
      const target = event.target.closest?.('[data-coordinate-party], [data-coordinate-user]');
      if (!target || !root.contains(target)) return;
      const point = target.classList.contains('coordinate-point');
      selected = target.hasAttribute('data-coordinate-user') ? 'user' : target.getAttribute('data-coordinate-party');
      selectionChosen = true;
      render();
      const selector = `${point ? '.coordinate-point' : '.coordinate-party-button'}${selected === 'user' ? '[data-coordinate-user]' : `[data-coordinate-party="${selected}"]`}`;
      root.querySelector(selector)?.focus?.();
    }
    function keydown(event) {
      if (!['Enter', ' '].includes(event.key)) return;
      const point = event.target.closest?.('.coordinate-point');
      if (!point || !root.contains(point)) return;
      event.preventDefault();
      choose(event);
    }
    function change(event) {
      if (destroyed) return;
      const target = event.target;
      if (target.hasAttribute('data-coordinate-scope') && ['all', 'answered'].includes(target.value)) chosenScope = target.value;
      else return;
      const focusId = target.id;
      render();
      root.querySelector(`#${focusId}`)?.focus?.();
    }
    root.addEventListener('click', choose);
    root.addEventListener('keydown', keydown);
    root.addEventListener('change', change);
    render();
    return {
      update() { render(); },
      destroy() { if (destroyed) return; destroyed = true; root.removeEventListener('click', choose); root.removeEventListener('keydown', keydown); root.removeEventListener('change', change); current = null; }
    };
  }
  return Object.freeze({mount});
})();
