'use strict';
window.LegislationModel = (() => {
  const D = window.PoliticsData;
  const keys = ['social', 'business', 'rights', 'openness', 'technology', 'military'];
  const labels = ['Социальные гарантии', 'Условия для бизнеса', 'Права и участие', 'Международная открытость', 'Технологические возможности', 'Военный потенциал'];
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const sum = a => a.reduce((n, x) => n + x, 0);
  const rounded = n => Math.round(n * 100) / 100;
  const emptyEffects = () => Object.fromEntries(keys.map(k => [k, 0]));
  const questions = new Map(D.questions.map(q => [q.id, q]));
  const partyIndices = new Map(D.parties.map((p, i) => [p.id, i]));

  function sharesToSeats(shares, seats) {
    const raw = shares.map(n => n * seats), result = raw.map(Math.floor);
    raw.map((n, i) => ({i, remainder: n - result[i]}))
      .sort((a, b) => b.remainder - a.remainder || a.i - b.i)
      .slice(0, seats - sum(result)).forEach(x => result[x.i]++);
    return result;
  }

  function normalizeBill(bill, index) {
    if (!bill || typeof bill.id !== 'string' || !bill.id || typeof bill.title !== 'string') throw Error('У законопроекта должны быть id и название');
    const proposalTargets = Object.fromEntries(Object.entries(bill.questionTargets || {}).filter(([id, value]) => {
      if (!Number.isFinite(value) || Math.abs(value) > 1) throw Error(`Некорректная позиция проекта ${bill.id}`);
      return questions.has(id);
    }));
    const year = bill.year ?? 2027;
    if (!Number.isInteger(year) || year < 2027 || year > 2031) throw Error(`Некорректный год проекта ${bill.id}`);
    const budgetCost = bill.budgetCost ?? 0;
    if (!Number.isFinite(budgetCost)) throw Error(`Некорректная стоимость проекта ${bill.id}`);
    const effects = Object.fromEntries(keys.map((k, i) => {
      const value = Array.isArray(bill.impacts) ? bill.impacts[i] ?? 0 : bill.impacts?.[k] ?? 0;
      if (!Number.isFinite(value)) throw Error(`Некорректный эффект проекта ${bill.id}`);
      return [k, clamp(value, -40, 40)];
    }));
    const source = bill.source || null;
    const sponsorshipEvidence = bill.sponsorshipEvidence === true || !!(source?.url && ['program', 'initiative'].includes(source.kind));
    return {
      ...bill, order: index, proposedYear: year, year: null, proposalTargets,
      sponsors: (bill.sponsors || []).filter(id => partyIndices.has(id)),
      proposedEffects: effects, originalBudgetCost: budgetCost,
      priority: clamp(bill.priority ?? .5, 0, 1), source, sponsorshipEvidence,
      status: 'pending', reasonCode: 'upcoming', reason: `Внесение запланировано на ${year} год.`, attempts: [],
      active: false, repealedYear: null, repealedBy: null
    };
  }

  function draftBill(bill, seatsByParty, coalition, discipline) {
    const sponsorInCoalition = bill.sponsors.some(id => coalition.has(partyIndices.get(id)) && seatsByParty.get(partyIndices.get(id)) > 0);
    const coalitionNegotiation = sponsorInCoalition && [...coalition].filter(i => seatsByParty.get(i) > 0).length > 1;
    const amendedTargets = {}, coalitionTargets = {};
    for (const [id, target] of Object.entries(bill.proposalTargets)) {
      const q = questions.get(id);
      let total = 0, weighted = 0;
      for (const party of coalition) {
        if (q.positions[party] == null) continue;
        const seats = seatsByParty.get(party) || 0;
        weighted += q.positions[party] * seats;
        total += seats;
      }
      coalitionTargets[id] = total ? rounded(weighted / total) : null;
      let negotiated = coalitionNegotiation && total ? target * (1 - .65 * discipline) + weighted / total * .65 * discipline : target;
      // Negotiation can soften an author's proposal, but cannot silently turn it into its opposite.
      if (target > 0) negotiated = clamp(negotiated, target * .15, target);
      else if (target < 0) negotiated = clamp(negotiated, target, target * .15);
      else negotiated = 0;
      // Cap after rounding too: a small original target must not be strengthened by precision loss.
      amendedTargets[id] = target > 0 ? clamp(rounded(negotiated), target * .15, target)
        : target < 0 ? clamp(rounded(negotiated), target, target * .15) : 0;
    }
    const originalStrength = sum(Object.values(bill.proposalTargets).map(Math.abs));
    const amendedStrength = sum(Object.values(amendedTargets).map(Math.abs));
    const amendmentScale = originalStrength ? clamp(amendedStrength / originalStrength, .15, 1) : 1;
    const amended = Object.keys(amendedTargets).some(id => Math.abs(amendedTargets[id] - bill.proposalTargets[id]) > .04);
    return {
      ...bill, sponsorInCoalition, negotiated: coalitionNegotiation && discipline > 0,
      amendedTargets, coalitionTargets, amended, amendmentScale: rounded(amendmentScale),
      effects: Object.fromEntries(keys.map(k => [k, rounded(bill.proposedEffects[k] * amendmentScale)])),
      budgetCost: rounded(bill.originalBudgetCost * amendmentScale),
      amendmentNote: amended ? 'Коалиционные поправки смягчили проект; эффекты и потребность в ресурсах уменьшены вместе с масштабом мер.' : 'На голосование поступает исходный курс проекта.'
    };
  }

  function voteOnBill(bill, enabled, totals, coalition, discipline, vacantSeats) {
    const entries = Object.entries(bill.amendedTargets);
    const votes = enabled.map((index, k) => {
      const party = D.parties[index], seats = totals[k], inCoalition = coalition.has(index);
      const known = entries.filter(([id]) => questions.get(id).positions[index] != null);
      const coverage = entries.length ? known.length / entries.length : 0;
      const isSponsor = bill.sponsors.includes(party.id);
      const distance = known.length ? sum(known.map(([id, target]) => Math.abs(questions.get(id).positions[index] - target))) / known.length : null;
      const alteration = entries.length ? Math.max(...entries.map(([id, value]) => Math.abs(value - bill.proposalTargets[id]))) : 0;
      const documentedSponsorship = isSponsor && bill.sponsorshipEvidence && alteration <= .8;
      let yes = 0, no = 0, abstain = seats, reason;
      if (documentedSponsorship) {
        yes = seats; abstain = 0;
        reason = 'Автор поддерживает собственный проект, основанный на указанной программе или инициативе.';
      } else if (!known.length) {
        reason = 'По вопросам этого проекта недостаточно сведений о позиции партии: все её места отнесены к воздержавшимся.';
      } else {
        const alignment = 1 - distance;
        let yesShare = clamp(.5 + .65 * alignment, 0, 1);
        let uncertainty = .12 * (1 - Math.abs(alignment));
        const compromiseCompatible = bill.negotiated && inCoalition;
        if (compromiseCompatible) {
          // A whip helps an agreed compromise, while severe policy disagreement still produces dissent.
          const pull = discipline * .8 * clamp((1.4 - distance) / .55, 0, 1);
          yesShare += (1 - yesShare) * pull;
          uncertainty *= 1 - pull;
        }
        const knownShare = coverage * (1 - uncertainty);
        [yes, no, abstain] = sharesToSeats([knownShare * yesShare, knownShare * (1 - yesShare), 1 - knownShare], seats);
        reason = compromiseCompatible && discipline > 0
          ? 'Оценка учитывает близость к согласованным поправкам и дисциплину коалиции; сильные разногласия сохраняют голоса против.'
          : 'Оценка голосования следует из близости программной позиции к проекту.';
        if (coverage < 1) reason += ' Места по вопросам без подтверждённой позиции остаются в воздержании.';
        if (isSponsor && alteration > .8) reason += ' Сильные поправки не позволяют автоматически приписать автору поддержку.';
      }
      return {party: party.id, index, name: party.short, seats, yes, no, abstain, coverage: rounded(coverage), knownQuestions: known.length, totalQuestions: entries.length, distance: distance === null ? null : rounded(distance), inCoalition, isSponsor, reason};
    });
    return {votes, yesSeats: sum(votes.map(v => v.yes)), noSeats: sum(votes.map(v => v.no)), abstainSeats: sum(votes.map(v => v.abstain)) + vacantSeats, vacantSeats};
  }

  function indicatorsFromEffects(effects) {
    return keys.map((id, i) => ({id, label: labels[i], value: rounded(50 + effects[id]), delta: effects[id]}));
  }

  function realizedLawEffects(bill, year, implementation) {
    if (bill.status !== 'passed' || year < bill.year) return emptyEffects();
    const age = year - bill.year;
    const rollout = age === 0 ? .45 : age === 1 ? .75 : 1;
    const afterRepeal = bill.repealedYear === null || year < bill.repealedYear ? 1 : Math.max(0, 1 - (year - bill.repealedYear + 1) / 2);
    return Object.fromEntries(keys.map(k => [k, rounded(bill.effects[k] * implementation * rollout * afterRepeal)]));
  }

  function effectsAt(bills, year, implementation) {
    const effects = emptyEffects();
    bills.filter(b => b.status === 'passed').forEach(b => {
      const contribution = realizedLawEffects(b, year, implementation);
      keys.forEach(k => { effects[k] += contribution[k]; });
    });
    keys.forEach(k => { effects[k] = rounded(clamp(effects[k], -40, 40)); });
    return effects;
  }

  function simulate(options = {}) {
    const {totals, enabled, coalition = [], implementation = .7, discipline = .7, throughYear = 2031} = options;
    if (!Array.isArray(enabled) || !Array.isArray(totals) || enabled.length !== totals.length || new Set(enabled).size !== enabled.length || enabled.some(i => !Number.isInteger(i) || i < 0 || i >= D.parties.length) || totals.some(n => !Number.isInteger(n) || n < 0) || sum(totals) > D.totalSeats) throw Error('Некорректное распределение мест');
    if (![implementation, discipline].every(n => Number.isFinite(n) && n >= 0 && n <= 1) || !Number.isInteger(throughYear) || throughYear < 2026 || throughYear > 2031) throw Error('Некорректные настройки законодательного сценария');
    if (!Array.isArray(coalition) || coalition.some(i => !enabled.includes(i))) throw Error('Коалиция должна содержать индексы выбранных партий');
    const members = new Set(coalition), seatsByParty = new Map(enabled.map((i, k) => [i, totals[k]]));
    const vacantSeats = D.totalSeats - sum(totals), coalitionSeats = sum([...members].map(i => seatsByParty.get(i)));
    const inputBills = options.bills ?? window.PoliticsBills ?? [];
    if (!Array.isArray(inputBills) || new Set(inputBills.map(b => b.id)).size !== inputBills.length) throw Error('У законопроектов должны быть уникальные id');
    const bills = inputBills.map(normalizeBill).map(b => draftBill(b, seatsByParty, members, discipline));
    bills.forEach(b => Object.assign(b, voteOnBill(b, enabled, totals, members, discipline, vacantSeats)));
    const baseline = {year: 2026, effects: emptyEffects(), scores: Object.fromEntries(keys.map(k => [k, 50])), indicators: indicatorsFromEffects(emptyEffects())};
    const timeline = [], activeGroups = new Map();
    let carry = 0;
    for (let year = 2027; year <= throughYear; year++) {
      const agendaCapacity = implementation === 0 ? 0 : Math.ceil(8 * implementation);
      const allocation = implementation === 0 ? 0 : rounded(18 + 12 * implementation);
      const carryIn = rounded(Math.min(12, carry * .4)), opening = rounded(allocation + carryIn);
      const budget = {allocation, carryIn, opening, spent: 0, raised: 0, remaining: opening};
      const annual = {year, agendaCapacity, considered: 0, scheduled: 0, passed: 0, rejected: 0, deferred: 0, budget, bills: []};
      const eligible = bills.filter(b => ['pending', 'notScheduled'].includes(b.status) && b.proposedYear <= year);
      const rank = b => b.priority * 40 + (b.sponsorInCoalition ? 25 : 0) + (year - b.proposedYear) * 5 + b.yesSeats / D.totalSeats * 12 + (b.budgetCost < 0 ? 12 : 0);
      eligible.sort((a, b) => rank(b) - rank(a) || a.proposedYear - b.proposedYear || a.order - b.order);
      for (const bill of eligible) {
        const sponsorPresent = bill.sponsors.some(id => (seatsByParty.get(partyIndices.get(id)) || 0) > 0);
        let reasonCode, reason;
        if (!sponsorPresent) {
          reasonCode = 'noSponsor'; reason = 'У авторов проекта нет мест в выбранном составе парламента.';
        } else if (annual.considered >= agendaCapacity) {
          reasonCode = implementation === 0 ? 'implementation' : 'agenda';
          reason = implementation === 0 ? 'Исполнение программы выключено: законодательная повестка не запускается.' : 'Проект отложен: годовая повестка занята другими инициативами.';
        } else {
          annual.considered++;
          const incumbents = bill.group ? activeGroups.get(bill.group) || [] : [];
          const opposing = incumbents.filter(b => b.active && bill.policyDirection && b.policyDirection && bill.policyDirection !== b.policyDirection);
          const currentConflict = opposing.find(b => b.year === year);
          if (currentConflict) {
            reasonCode = 'conflict'; reason = `В этом году уже принят противоположный курс: «${currentConflict.title}». Новая редакция может вернуться в следующую повестку.`;
          } else if (bill.budgetCost > budget.remaining + .001) {
            reasonCode = 'budget'; reason = `Для проекта нужно ${bill.budgetCost} единиц ресурса, доступно ${rounded(budget.remaining)}. Обсуждение отложено до появления финансирования.`;
          } else {
            annual.scheduled++;
            bill.year = year;
            if (bill.yesSeats >= D.majority) {
              bill.status = 'passed'; bill.active = true;
              bill.reasonCode = 'majority';
              bill.reason = `Принят: ${bill.yesSeats} голосов за при необходимых ${D.majority}.`;
              if (opposing.length) {
                opposing.forEach(b => { b.active = false; b.repealedYear = year; b.repealedBy = bill.id; });
                bill.replaces = opposing[0].id;
                bill.replacesIds = opposing.map(b => b.id);
                bill.reason += ` Новый курс заменяет ${opposing.map(b => `«${b.title}»`).join(', ')}; оставшийся эффект постепенно затухает.`;
              }
              if (bill.group) activeGroups.set(bill.group, [...incumbents.filter(b => b.active), bill]);
              if (bill.budgetCost >= 0) budget.spent = rounded(budget.spent + bill.budgetCost);
              else budget.raised = rounded(budget.raised - bill.budgetCost);
              budget.remaining = rounded(budget.remaining - bill.budgetCost);
              annual.passed++;
            } else {
              bill.status = 'rejected'; bill.reasonCode = 'votes';
              bill.reason = `Отклонён: ${bill.yesSeats} голосов за, до большинства не хватает ${D.majority - bill.yesSeats}.`;
              annual.rejected++;
            }
          }
        }
        if (reasonCode) {
          bill.status = 'notScheduled'; bill.reasonCode = reasonCode; bill.reason = reason;
          annual.deferred++;
        }
        const attempt = {year, status: bill.status, reasonCode: bill.reasonCode, reason: bill.reason, budgetAvailable: budget.remaining};
        bill.attempts.push(attempt);
        annual.bills.push({...bill, attempts: [...bill.attempts], votes: bill.votes.map(v => ({...v})), active: bill.active, ...attempt});
      }
      annual.effects = effectsAt(bills, year, implementation);
      annual.scores = Object.fromEntries(keys.map(k => [k, rounded(50 + annual.effects[k])]));
      annual.indicators = indicatorsFromEffects(annual.effects);
      annual.adoptedIds = bills.filter(b => b.status === 'passed').map(b => b.id);
      annual.activeIds = bills.filter(b => b.active).map(b => b.id);
      timeline.push(annual); carry = budget.remaining;
    }
    bills.forEach(b => { b.realizedEffects = realizedLawEffects(b, throughYear, implementation); });
    const effects = effectsAt(bills, throughYear, implementation);
    return {
      version: '1.0', year: throughYear, implementation, discipline, enabled: [...enabled], totals: [...totals], coalition: [...members], coalitionSeats,
      coalitionMajority: coalitionSeats >= D.majority, totalSeats: D.totalSeats, majority: D.majority, vacantSeats,
      baseline, timeline, bills, adopted: bills.filter(b => b.status === 'passed'), active: bills.filter(b => b.active),
      effects, scores: Object.fromEntries(keys.map(k => [k, rounded(50 + effects[k])])), indicators: indicatorsFromEffects(effects),
      summary: {passed: bills.filter(b => b.status === 'passed').length, rejected: bills.filter(b => b.status === 'rejected').length, notScheduled: bills.filter(b => b.status === 'notScheduled').length, pending: bills.filter(b => b.status === 'pending').length, repealed: bills.filter(b => b.repealedYear !== null).length, scheduled: sum(timeline.map(t => t.scheduled))},
      explanations: [
        'Голоса — расчёт по программным позициям и коалиционным поправкам. Неизвестная позиция даёт воздержание; сведения об авторстве берутся из источника проекта.',
        '226 голосов нужны для принятия каждого проекта. Реализация определяет вместимость повестки, ресурс и скорость эффекта; дисциплина — поддержку согласованных коалиционных поправок.',
        'Ресурс — условная ёмкость исполнения, не рубли. Индексы начинаются с 50 в 2026 году и меняются только вследствие принятых законов: 45% эффекта в первый год, 75% во второй, полный эффект с третьего.'
      ]
    };
  }
  return Object.freeze({simulate, keys: Object.freeze(keys), labels: Object.freeze(labels)});
})();
