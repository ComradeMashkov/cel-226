'use strict';
// Future dates, bill titles, budget units and index effects are authored simulation rules.
// source.kind identifies the evidence for the policy direction, never a real future bill or vote.
// Targets use data.js canonical topic axes [-1, 1], independently of displayed answer order.
window.PoliticsBills = (() => {
  const sources = {
    er: {url:'https://np.er.ru/',title:'Народная программа «Единой России»',year:2026},
    kprf: {url:'https://kprf.ru/party/program',title:'Программа КПРФ, разделы 3–4',year:null},
    pension: {url:'https://kprf.ru/party-live/cknews/243374.html',title:'Программа Победы КПРФ',year:2026},
    sr: {url:'https://altai.spravedlivo.ru/28755710',title:'Манифест справедливости, публикация Алтайского отделения',year:2026},
    srBank: {url:'https://spravedlivo.ru/15809910',title:'Валерий Гартунг о законопроектах СР',year:2026},
    green: {url:'https://2026.greens.ru/',title:'Семь шагов «Зелёных»',year:2026},
    yabloko: {url:'https://www.yabloko.ru/program',title:'«Уважение к человеку»',year:2016},
    peace: {url:'https://www.yabloko.ru/cat-news/2026/06/29-1',title:'Предвыборный съезд и программа «Яблока»',year:2026},
    bologna: {url:'https://www.yabloko.ru/publikatsii/2022/06/03',title:'«Выйти нельзя остаться», публикация о Болонской системе',year:2022},
    ppd: {url:'https://digitaldem.ru/tpost/0gi9662pk1-rovno-dvenadtsat-vremya-vozvraschat-poli?amp=true',title:'«Ровно двенадцать»: программа ППД',year:2026},
    nl: {url:'https://lp.newpeople.ru/',title:'«12 шагов к нормальной России»',year:2026},
    ldpr: {url:'https://ldpr.ru/event/sezd-ldpr-utverdil-predvybornuyu-programmu-partii/',title:'«100 дней преобразования России»',year:2026},
    ege: {url:'https://ldpr.ru/event/ldpr-predlozhila-zamenit-ege-vstupitelnymi-ekzamenami/',title:'ЛДПР предложила заменить ЕГЭ вступительными экзаменами',year:2026},
    rodina: {url:'https://vladimir.rodina.ru/partiya/documentsForRead/48',title:'Предвыборная программа «Родины»',year:2021},
    rodinaMigration: {url:'https://rodina.ru/press-sluzhba/novosti/zhuravlev-v-demigrantizacii-nuzhdayutsya-ne-tolko-strojki-no-i-zhkx/',title:'Алексей Журавлёв о трудовой миграции',year:2021}
  };
  const evidence = (key, kind, note) => Object.freeze({...sources[key],kind,note});
  const effects = (social=0,business=0,rights=0,openness=0,technology=0,military=0) =>
    Object.freeze({social,business,rights,openness,technology,military});
  const bills = [
    {
      id:'er-veterans',title:'Возвращение ветеранов к гражданской жизни',sponsors:['er'],year:2027,priority:.95,
      description:'Единая программа реабилитации, переобучения и помощи с работой для участников СВО. Расходы растут; другие социальные программы конкурируют за специалистов.',
      questionTargets:{'svo-veterans':-.4,'benefits':-.3},impacts:effects(5,1,0,0,1),budgetCost:7,
      source:evidence('er','program','Раздел 2.6 прямо предусматривает реабилитацию, трудоустройство и переподготовку ветеранов. Название и параметры пакета созданы для сценария.')
    },
    {
      id:'er-chips',title:'Государственный заказ на российские чипы',sponsors:['er'],year:2028,priority:.88,
      description:'Основной дополнительный госзаказ получает отечественная микроэлектроника. Появляется устойчивый спрос, но техника сначала дороже и выбор поставщиков уже.',
      questionTargets:{'industry-chips':.8,'industry-procurement':.8,'industry-subsidy':.7},impacts:effects(0,-2,0,-1,5,1),budgetCost:10,
      group:'chip-procurement',policyDirection:1,
      source:evidence('er','modeled','Программа поддерживает технологический суверенитет и промышленность; отдельный будущий закон о чипах и его госзаказ — редакционная адаптация.')
    },
    {
      id:'er-engineers',title:'Колледжи и инженерные кадры для регионов',sponsors:['er'],year:2029,priority:.78,
      description:'Расширить государственный заказ на инженеров, обновить колледжи и связать практику с предприятиями. Приоритетные специальности получают больше средств за счёт остальных.',
      questionTargets:{'edu-funding':.6,'subsidies':-.3},impacts:effects(2,2,0,0,4),budgetCost:7,
      source:evidence('er','program','Разделы 2.2–2.3 посвящены подготовке кадров и университетам. Распределение средств и сценарный год заданы редакцией.')
    },
    {
      id:'kprf-pensions',title:'Возврат пенсионного возраста 55 / 60',sponsors:['kprf'],year:2027,priority:.94,
      description:'Поэтапно вернуть прежний возраст выхода на пенсию. Люди раньше получают выплаты; пенсионная система требует дополнительных бюджетных средств.',
      questionTargets:{'pensions':-1,'ussr-social':.8},impacts:effects(6,-2),budgetCost:12,
      source:evidence('pension','program','В докладе о Программе Победы прямо предложен возврат возраста 55 лет для женщин и 60 для мужчин. Поэтапность — правило сценария.')
    },
    {
      id:'kprf-strategic',title:'Общественная собственность в стратегических отраслях',sponsors:['kprf'],year:2028,priority:.88,
      description:'Передавать ключевые сырьевые и инфраструктурные активы государству по установленной процедуре. Доходы направляются на общие задачи; инвесторы сталкиваются с неопределённостью.',
      questionTargets:{'strategic-companies':-1,'ussr-privatization':1,'ussr-economy':.9},impacts:effects(3,-5,-1,-1,2,1),budgetCost:9,
      source:evidence('kprf','program','Программа-минимум предусматривает национализацию стратегических отраслей. Процедура, компенсации и бюджетный эффект не получены из источника.')
    },
    {
      id:'kprf-workers',title:'Советы работников и защита от увольнения',sponsors:['kprf'],year:2030,priority:.73,
      description:'Расширить полномочия профсоюзов и работников при реорганизации предприятий. Защита занятости усиливается; работодателям сложнее быстро менять производство.',
      questionTargets:{'employment':-.9,'ussr-economy':.6},impacts:effects(4,-3,2,0,-1),budgetCost:3,
      source:evidence('kprf','program','Разделы 3–4 предусматривают рабочее самоуправление и расширение прав трудовых коллективов и профсоюзов. Конкретная процедура — сценарная.')
    },
    {
      id:'sr-bank-profit',title:'Налог на сверхприбыль банков',sponsors:['sr'],year:2027,priority:.93,
      description:'Дополнительный сбор с исключительной прибыли банков пополняет социальный резерв. Бюджет получает ресурс; часть нагрузки может перейти в стоимость финансовых услуг.',
      questionTargets:{'wealth':-.8,'taxes':-.7},impacts:effects(2,-3,0,0,0),budgetCost:-6,
      source:evidence('srBank','initiative','Официальная публикация 14 января 2026 года описывает инициативу СР о налоге на сверхприбыль банков. Будущее принятие не предполагается источником.')
    },
    {
      id:'sr-medicine',title:'Лекарства без непосильных расходов',sponsors:['sr'],year:2028,priority:.84,
      description:'Компенсировать часть расходов семьи на необходимые лекарства сверх установленной доли дохода. Лечение доступнее, но проверка расходов требует денег и администрирования.',
      questionTargets:{'healthcare':-.8,'benefits':-.7},impacts:effects(5,-1,0,0,1),budgetCost:8,
      source:evidence('sr','program','Цель 3 региональной публикации манифеста предлагает компенсацию расходов на лекарства свыше 10% дохода семьи. Федеральное распространение — адаптация.')
    },
    {
      id:'sr-social-housing',title:'Социальные арендные дома',sponsors:['sr'],year:2031,priority:.76,
      description:'Увеличить фонд жилья для долгосрочного социального найма. Аренда становится доступнее части семей; строительство и содержание оплачивает бюджет.',
      questionTargets:{'housing':-.7,'public-management':-.5},impacts:effects(5,1,0,0,0),budgetCost:9,
      source:evidence('sr','program','Цель 7 манифеста предусматривает развитие социального и арендного жилья. Объём строительства и сценарная стоимость не являются обещаниями партии.')
    },
    {
      id:'green-monitoring',title:'Качество воздуха и воды — на открытой карте',sponsors:['green'],year:2027,priority:.93,
      description:'Открытые датчики и единый публичный реестр загрязнения рядом с предприятиями. Жители видят данные; бизнес несёт расходы на измерения и модернизацию.',
      questionTargets:{'environmental-rules':-1,'water':-1,'state-budget':-.3},impacts:effects(4,-2,2,0,3),budgetCost:5,
      source:evidence('green','program','Шаг 7 программы 2026 прямо предусматривает автоматизированный публичный мониторинг воды, воздуха и почв. Формат карты — сценарный.')
    },
    {
      id:'green-polluter',title:'Загрязнитель оплачивает восстановление',sponsors:['green'],year:2028,priority:.85,
      description:'Ответственность владельцев предприятий связать с доказанным экологическим ущербом. Средства идут на восстановление; экологические издержки могут повысить цены товаров.',
      questionTargets:{'pollution-tax':-1,'environmental-rules':-.9},impacts:effects(4,-3,1,0,2),budgetCost:-3,
      source:evidence('green','program','Шаг 7 предлагает личную ответственность владельцев бизнеса соразмерно экологическому ущербу. Сценарная модель не устанавливает уголовных санкций.')
    },
    {
      id:'green-regional-care',title:'Мобильные лаборатории для малых поселений',sponsors:['green'],year:2029,priority:.75,
      description:'Оснастить ФАПы и запустить мобильные государственные лаборатории. Медицинская помощь ближе к дому; регионы получают постоянные расходы на персонал и технику.',
      questionTargets:{'healthcare':-.7,'regional-services':-.3},impacts:effects(5,0,0,0,2),budgetCost:7,
      source:evidence('green','program','Шаг 5 прямо включает оборудование ФАПов и мобильные государственные лаборатории. Индексные эффекты и стоимость придуманы для модели.')
    },
    {
      id:'yabloko-peace',title:'Парламентский мандат на переговоры',sponsors:['yabloko'],year:2027,priority:.99,
      description:'Сделать переговоры о прекращении огня государственным приоритетом и ввести парламентские отчёты о гражданских последствиях конфликта. Итог требует согласия других сторон.',
      questionTargets:{'svo-negotiations':-1,'svo-security':-.9,'svo-discussion':-.9},impacts:effects(3,2,2,4,1,-2),budgetCost:3,
      source:evidence('peace','program','Программа 2026 прямо поддерживает соглашение о прекращении огня, дипломатию и мир. Парламентский мандат — сценарная форма, а не существующий закон.')
    },
    {
      id:'yabloko-courts',title:'Независимый суд и свободное мирное участие',sponsors:['yabloko'],year:2028,priority:.91,
      description:'Усилить независимость назначения судей и защиту мирных собраний. Гражданам проще оспаривать решения власти; согласование государственных решений становится сложнее.',
      questionTargets:{'state-judges':-1,'state-assembly':-.9,'state-elections':-.9},impacts:effects(1,2,6,2),budgetCost:4,
      source:evidence('yabloko','program','Историческая программа 2016 содержит судебную реформу и гарантии гражданских свобод. Пакет не выдаётся за новую программу 2026.')
    },
    {
      id:'yabloko-diplomas',title:'Сопоставимые дипломы и международные обмены',sponsors:['yabloko'],year:2029,priority:.79,
      description:'Сохранить совместимость бакалавриата и магистратуры с Болонской системой и расширить обмены. Выпускникам легче продолжать обучение; нужны договорённости и переработка программ.',
      questionTargets:{'edu-bologna':-.8,'edu-diploma':-.6,'edu-exchange':-.7},impacts:effects(1,2,1,4,3,0),budgetCost:5,
      source:evidence('bologna','modeled','Публикация на сайте партии защищает участие в Болонском процессе. Это не принятая программа 2026: будущий законодательный пакет — редакционная адаптация.')
    },
    {
      id:'ppd-privacy',title:'Личные данные — под судебной защитой',sponsors:['ppd'],year:2027,priority:.94,
      description:'Доступ ведомств к переписке, геолокации и биометрии — по судебному решению; цифровое профилирование требует согласия. Частная жизнь защищённее, проверки занимают больше времени.',
      questionTargets:{'cameras':-.9,'state-internet':-.8},impacts:effects(0,1,5,1,1),budgetCost:3,
      source:evidence('ppd','program','Пункты 1 и 4 программы прямо касаются судебного контроля доступа к данным и запрета слежки без согласия. Программный тезис преобразован в сценарный пакет.')
    },
    {
      id:'ppd-budget',title:'Граждане распределяют часть местного бюджета',sponsors:['ppd'],year:2028,priority:.89,
      description:'Публиковать муниципальные расходы и отдавать часть средств на голосование жителей с проверкой результата. Участие шире; процедуры стоят денег и удлиняют принятие бюджета.',
      questionTargets:{'state-budget':-1,'regional-power':-.7,'state-digital-vote':-.5},impacts:effects(2,1,4,0,3),budgetCost:4,
      source:evidence('ppd','program','Пункты 5 и 11 предусматривают цифровой бюджет и голосования. Доля средств и независимая проверка добавлены как правила сценария.')
    },
    {
      id:'ppd-open-entry',title:'Простой въезд для туристов и научных специалистов',sponsors:['ppd'],year:2031,priority:.77,
      description:'Расширить электронные визы и ускорить оформление для приглашённых учёных и инженеров с проверкой рисков. Контактов больше; возрастают расходы на проверку и интеграцию.',
      questionTargets:{'world-visas':-.7,'world-west':-.5,'edu-science':-.6},impacts:effects(0,3,1,5,3),budgetCost:3,
      source:evidence('ppd','modeled','Пункт 9 поддерживает открытость для туристов, учёных, инженеров и предпринимателей. Электронные визы и их условия — сценарная детализация.')
    },
    {
      id:'nl-startups',title:'Налоговые каникулы и социальное страхование стартапов',sponsors:['nl'],year:2027,priority:.94,
      description:'Дать новым компаниям налоговые каникулы, а самозанятым — доступное добровольное страхование. Запуск бизнеса проще; сначала бюджет недополучает доходы.',
      questionTargets:{'taxes':.7,'pensions':.4,'employment':.4},impacts:effects(2,5,1,0,3),budgetCost:6,
      source:evidence('nl','program','«12 шагов» включает трёхлетние налоговые каникулы для стартапов и добровольное соцстрахование самозанятых. Влияние на индексы — правило игры.')
    },
    {
      id:'nl-chips',title:'Конкурентные закупки и открытые гранты для чипов',sponsors:['nl'],year:2028,priority:.86,
      description:'Дополнительный госзаказ распределять по цене и качеству, допуская импорт; российским разработчикам дать открытые гранты. Выбор шире, но зависимость от внешних поставок сохраняется.',
      questionTargets:{'industry-chips':-.3,'industry-procurement':-.4,'industry-subsidy':-.6},impacts:effects(0,4,0,3,4,-1),budgetCost:7,
      group:'chip-procurement',policyDirection:-1,
      source:evidence('nl','modeled','Программа поддерживает конкуренцию без запрета импорта и инвестиции в микроэлектронику. Механизм госзакупок чипов и грантов — редакционная адаптация.')
    },
    {
      id:'nl-regional-taxes',title:'Больше налоговых доходов остаётся в регионах',sponsors:['nl'],year:2029,priority:.81,
      description:'Часть налогов цифровой торговли направить по месту покупателя, расширив местные полномочия. Регионы получают ресурс; федеральному бюджету сложнее выравнивать различия.',
      questionTargets:{'regional-taxes':-.9,'regional-power':-.7,'state-budget':-.5},impacts:effects(2,3,2,0,1),budgetCost:4,
      source:evidence('nl','program','Раздел «Налоги — в регионе, а не в Москве» прямо предлагает распределение платежей онлайн-сервисов по месту покупателя. Федеральные издержки — сценарная оценка.')
    },
    {
      id:'ldpr-indexation',title:'Ускоренная индексация пенсий и пособий',sponsors:['ldpr'],year:2027,priority:.94,
      description:'Повышать пенсии и пособия по ускоренному графику. Доходы получателей растут; дополнительные обязательства оставляют меньше средств на другие программы.',
      questionTargets:{'pensions':-.8,'benefits':-.6,'minimum-wage':-.6},impacts:effects(5,-2,0,0,0),budgetCost:10,
      source:evidence('ldpr','program','В сообщении о программе 2026 предложена ежегодная индексация пенсий и пособий минимум на 20%. Здесь моделируется направление, а не реальный прогноз цен.')
    },
    {
      id:'ldpr-housing',title:'Льготная ипотека для молодых специалистов',sponsors:['ldpr'],year:2028,priority:.83,
      description:'Субсидировать ставку ипотеки для молодых специалистов, бюджетников и нуждающихся семей. Часть людей покупает жильё раньше; субсидии дороги и могут подогревать спрос.',
      questionTargets:{'housing':-.4,'benefits':-.5},impacts:effects(4,2,0,0,0),budgetCost:8,
      source:evidence('ldpr','program','Программа 2026 включает «Народную ипотеку» под 3% для этих групп. Сценарий не обещает такую ставку или доступность кредита в будущем.')
    },
    {
      id:'ldpr-entrance-exams',title:'Вступительные испытания вместо единственного ЕГЭ',sponsors:['ldpr'],year:2030,priority:.75,
      description:'Вузам вернуть вступительные испытания и добавить разные способы оценки знаний. Форматов больше; абитуриентам нужны дополнительные поездки и подготовка.',
      questionTargets:{'edu-ege':.9},impacts:effects(1,-1,0,0,1),budgetCost:4,
      source:evidence('ege','initiative','Предложение председателя ЛДПР от 19 августа 2026 года включает замену ЕГЭ и право вузов на вступительные испытания. Порядок перехода сценарный.')
    },
    {
      id:'rodina-industrial-credit',title:'Длинные кредиты для российской промышленности',sponsors:['rodina'],year:2027,priority:.91,
      description:'Запустить государственную линию дешёвого долгосрочного кредита для отечественных производств. Локальные цепочки растут; бюджет принимает риск неудачных проектов.',
      questionTargets:{'subsidies':-.8,'industry-priorities':.7,'industry-subsidy':.7},impacts:effects(1,1,0,-1,4,1),budgetCost:9,
      source:evidence('rodina','program','Историческая программа 2021 предусматривает промышленный рывок и поддержку производства. Модель кредитной линии — сценарная конкретизация, актуальность позиции не подтверждена новой программой.')
    },
    {
      id:'rodina-local-workers',title:'Подготовка местных работников вместо роста трудовой миграции',sponsors:['rodina'],year:2028,priority:.85,
      description:'Сократить привлечение иностранных работников, финансируя повышение зарплат и подготовку кадров внутри страны. Местных возможностей больше; бизнес рискует получить дефицит персонала.',
      questionTargets:{'migration-routes':.9,'migration-economy':.9},impacts:effects(2,-3,0,-3,1,0),budgetCost:5,
      source:evidence('rodinaMigration','initiative','Публикация 17 ноября 2021 года поддерживает сокращение трудовой миграции, рост зарплат и привлечение граждан из регионов. Источник исторический; параметры пакета редакционные.')
    },
    {
      id:'rodina-municipal-money',title:'Финансовая база местного самоуправления',sponsors:['rodina'],year:2031,priority:.74,
      description:'Закрепить дополнительные доходы за муниципалитетами для дорог и коммунальных сетей. Местные задачи решаются быстрее; выравнивать бюджеты между территориями становится труднее.',
      questionTargets:{'regional-taxes':-.6,'regional-power':-.5,'regional-services':-.4},impacts:effects(3,2,1,0,1),budgetCost:5,
      source:evidence('rodina','program','Программа 2021 содержит направление «Местное самоуправление: вернуть деньги в регионы». Конкретные доли доходов и последствия — сценарные, источник исторический.')
    }
  ];
  return Object.freeze(bills.map(bill => Object.freeze({...bill,
    sponsors:Object.freeze(bill.sponsors),questionTargets:Object.freeze(bill.questionTargets)
  })));
})();
