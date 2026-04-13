"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const GAME_FAQ_TOPICS = [
  {
    id: "start",
    title: "Старт и первые деньги",
    summary: "Как зарегистрироваться, что делать в первый час и где взять стартовый капитал.",
    commands: ["/reg", "/balance", "/work", "/daily", "/richest"],
    keywords: ["старт", "начать", "новичок", "регистрация", "паспорт", "первые деньги"],
    questions: [
      {
        id: "start-reg",
        question: "Как начать играть в SAMP Life?",
        answer: "Используй `/reg`. После регистрации игрок получает стартовый профиль, `$500` и активный стартовый транспорт `Велосипед`. Дальше базовый цикл такой: `/balance` чтобы посмотреть профиль, `/work` чтобы заработать первые деньги, `/daily` чтобы забирать ежедневный бонус и `/dealership` или `/weaponshop`, когда накопишь на покупки.",
        commands: ["/reg", "/balance", "/work", "/daily"],
        keywords: ["как начать", "reg", "рег", "первый шаг", "стартовый набор"],
      },
      {
        id: "start-first-money",
        question: "Что выгоднее всего делать новичку в первый день?",
        answer: "Самый безопасный старт для новичка: `1)` забрать `/daily`, `2)` спамить не нужно, а просто периодически использовать `/work`, `3)` после накопления перейти к `/truck`, `4)` уже потом смотреть на `/rob`, гонки, дуэли и казино. Ранний рискованный геймплей может быстро отправить в минус или в тюрьму.",
        commands: ["/daily", "/work", "/truck", "/rob"],
        keywords: ["новичок", "с чего начать", "первый день", "фарм", "первые вирты"],
      },
      {
        id: "start-reset",
        question: "Можно ли начать заново, если я всё проиграл или потратил?",
        answer: "В коде нет пользовательской команды для сброса или перерегистрации аккаунта. Если ты уже прошёл `/reg`, повторно стартовый набор не выдаётся. Восстанавливаться нужно обычным игровым путём: `/daily`, `/work`, `/truck`, осторожные переводы через `/pay` от друзей, а не повторная регистрация.",
        commands: ["/reg", "/daily", "/work", "/truck", "/pay"],
        keywords: ["сброс", "рестарт", "заново", "повторная регистрация"],
      },
      {
        id: "start-daily",
        question: "Как работает ежедневный бонус `/daily`?",
        answer: "`/daily` доступен раз в `24 часа`. Сумма зависит от текущего серверного стрика активности: без активного стрика новичок получает `$500`, при `1+` дне стрика — `$1,000`, при `3+` — `$2,000`, при `7+` — `$5,000`, при `14+` — `$15,000`, при `30+` — `$50,000`. То есть `/daily` выгоднее тем, кто действительно держит активность каждый день.",
        commands: ["/daily", "/streak"],
        keywords: ["daily", "ежедневный бонус", "награда за вход", "стрик"],
      },
    ],
  },
  {
    id: "economy",
    title: "Заработок, тюрьма и переводы",
    summary: "Работы, грабежи, штрафы, тюрьма и базовые денежные операции.",
    commands: ["/work", "/truck", "/rob", "/pay", "/bail"],
    keywords: ["заработок", "деньги", "тюрьма", "штраф", "перевод", "кулдаун"],
    questions: [
      {
        id: "economy-work-vs-truck",
        question: "Чем отличаются `/work`, `/truck` и `/rob`?",
        answer: "`/work` — самый безопасный способ заработка. Команда имеет кулдаун `60 секунд`, а выплата масштабируется от твоего серверного уровня. ` /truck` — дальнобой с кулдауном `15 минут`: платит заметно больше, но есть `18%` шанс аварии и штрафа. `/rob` — рискованный заработок с кулдауном `10 минут`: можно ограбить `24/7` или другого игрока, но есть шанс ареста, штрафа и тюрьмы.",
        commands: ["/work", "/truck", "/rob", "/level"],
        keywords: ["работа", "дальнобой", "ограбление", "что выгоднее", "кулдаун"],
      },
      {
        id: "economy-work-scale",
        question: "Правда ли, что уровень влияет на `/work`?",
        answer: "Да. `/work` использует не фиксированную сумму, а базовую награду, умноженную на коэффициент от серверного уровня. Это значит, что чем выше твой общий уровень активности на сервере, тем выгоднее становится обычная подработка. На низких уровнях это скорее стабильный старт, на высоких — уже неплохой фоновый фарм.",
        commands: ["/work", "/level", "/levels-top"],
        keywords: ["уровень", "влияет", "work", "зарплата"],
      },
      {
        id: "economy-jail",
        question: "Что происходит, если меня поймают на ограблении?",
        answer: "При неудачном `/rob` игрок получает штраф и попадает в тюрьму. Для ограбления `24/7` шанс ареста ниже, чем для ограбления другого игрока, но в обоих случаях тюрьма блокирует активные SAMP-действия. Пока действует `jail_until`, нельзя нормально фармить, драться и выполнять ряд игровых операций.",
        commands: ["/rob", "/balance", "/bail"],
        keywords: ["арест", "поймали", "тюрьма", "rob", "штраф"],
      },
      {
        id: "economy-bail",
        question: "Как работает `/bail` и стоит ли им пользоваться?",
        answer: "`/bail` досрочно снимает тюремный статус за деньги. Цена зависит от оставшегося времени и считается как `$1,000` за минуту остатка, но не меньше `$500` и не больше `$10,000`. Использовать `/bail` имеет смысл, если ты хочешь быстро вернуться к фарму, дуэлям или гонкам и уверен, что отобьёшь эти деньги.",
        commands: ["/bail", "/balance"],
        keywords: ["откуп", "освободиться", "выйти из тюрьмы", "bail"],
      },
      {
        id: "economy-transfer",
        question: "Можно ли переводить деньги другим игрокам?",
        answer: "Да. Для этого есть `/pay user:@игрок amount:<сумма>`. Это обычный перевод между игроками внутри экономики. Если ты сидишь в тюрьме или у тебя не хватает баланса, перевод не пройдет. Все денежные движения пишутся в игровой ledger, то есть экономика отслеживается довольно жёстко.",
        commands: ["/pay"],
        keywords: ["перевод", "дать деньги", "скинуть вирты", "pay"],
      },
    ],
  },
  {
    id: "cars",
    title: "Машины, гараж и гонки",
    summary: "Покупка машин, активная тачка, тюнинг, офферы и механика гонок.",
    commands: ["/dealership", "/buy", "/garage", "/switchcar", "/tune", "/tunecar", "/race", "/sellcar", "/buycar"],
    keywords: ["машины", "гараж", "гонки", "тюнинг", "автосалон", "оффер"],
    questions: [
      {
        id: "cars-buy",
        question: "Как купить машину и что считается активной тачкой?",
        answer: "Сначала открой `/dealership`, выбери модель и купи её через `/buy type:car id:<id>`. После покупки машина добавляется в гараж, а активной становится именно она. Активная машина используется в профиле и при расчёте гонок, поэтому важно следить не только за ценой, но и за параметром скорости.",
        commands: ["/dealership", "/buy", "/garage"],
        keywords: ["купить машину", "активная машина", "buy car", "dealership"],
      },
      {
        id: "cars-garage",
        question: "Зачем нужен `/garage`?",
        answer: "`/garage` показывает твои машины и тюнинг. Через него проще понять, чем ты реально владеешь, какая машина сейчас активна и что на ней установлено. Если у тебя несколько авто, именно гараж становится основной точкой для контроля коллекции, а для быстрого переключения части машин доступны кнопки прямо под сообщением.",
        commands: ["/garage", "/switchcar"],
        keywords: ["гараж", "мои машины", "garage"],
      },
      {
        id: "cars-switch",
        question: "Как сменить активную машину?",
        answer: "Используй `/switchcar car:<id>`, чтобы выбрать любую машину из своего гаража. Если нужная машина попала в быстрый список под `/garage`, можно переключить её и кнопкой. Команда сработает только для той техники, которой ты уже владеешь.",
        commands: ["/switchcar", "/garage"],
        keywords: ["сменить активную машину", "switchcar", "активная тачка", "выбрать машину"],
      },
      {
        id: "cars-race",
        question: "От чего зависит победа в `/race`?",
        answer: "Гонка теперь смотрит не только на голую скорость. На результат влияют билд активной машины, её скорость, старт, зацеп, стабильность, износ деталей и случайный фактор. То есть хороший тюнинг реально меняет шанс победы, а изношенная сборка начинает проигрывать чаще даже на быстрой машине. Ставка уходит победителю, а оба участника получают кулдаун на повторный заезд.",
        commands: ["/race", "/tune", "/garage"],
        keywords: ["как победить в гонке", "race", "скорость", "тюнинг"],
      },
      {
        id: "cars-tuning",
        question: "Что даёт тюнинг машины?",
        answer: "Главная команда теперь — `/tune`. Через `/tune install`, `/tune inspect`, `/tune maintain` и `/tune remove` ты собираешь реальный билд машины, а не просто покупаешь плоский бонус к скорости. Детали влияют на скорость, старт, зацеп, стабильность и ресурс; износ режет эффективность; сильные детали открываются по уровню тюнинга и результатам гонок. `/tunecar` оставлен как legacy-алиас для быстрой установки старым способом, но основной UX теперь живёт в `/tune`.",
        commands: ["/tune", "/tunecar", "/race", "/garage"],
        keywords: ["nos", "turbo", "engine", "апгрейд", "тюнинг"],
      },
      {
        id: "cars-tuning-level",
        question: "Как повысить уровень тюнинга авто?",
        answer: "Уровень тюнинга качается **отдельно для каждой машины**, а не сразу для всего аккаунта. Прогресс идёт через гонки: за поражение машина получает `+1 XP`, за ничью `+2 XP`, за победу `+3 XP`. Каждые `6 XP` дают следующий уровень тюнинга, максимум — `10` уровень. Посмотреть текущий прогресс можно через `/tune inspect car:<id>`. Важный нюанс: топовые детали открываются не только от уровня, но и от гоночной статистики. Например, `Turbo` требует `уровень 4 + 3 гонки`, `Roll Cage` — `уровень 4 + 5 гонок`, а `Forged Engine V8` — `уровень 5 + 3 победы`.",
        commands: ["/tune inspect", "/race", "/garage"],
        keywords: ["как повысить уровень тюнинга", "уровень тюнинга авто", "прокачать тюнинг", "tune level", "xp тюнинга", "как качать tune"],
      },
      {
        id: "cars-trading",
        question: "Как продать машину другому игроку?",
        answer: "Используй `/sellcar user:@покупатель car:<id> price:<сумма>`, чтобы создать оффер. Затем покупатель принимает его через `/buycar offer:<id>`. Деньги и автомобиль переходят атомарно: предложение нельзя корректно принять дважды, а после успешной сделки оно закрывается.",
        commands: ["/sellcar", "/buycar"],
        keywords: ["продать машину", "оффер", "sellcar", "buycar"],
      },
    ],
  },
  {
    id: "combat",
    title: "Оружие, дуэли и ремонт",
    summary: "Покупка оружия, активный ствол, дуэли, урон и починка.",
    commands: ["/weaponshop", "/buy", "/weapon", "/duel", "/repair"],
    keywords: ["оружие", "дуэль", "урон", "ремонт", "weaponshop"],
    questions: [
      {
        id: "combat-buy",
        question: "Как купить и экипировать оружие?",
        answer: "Открой `/weaponshop`, выбери ствол и купи его через `/buy type:weapon id:<id>`. После первой покупки оружие обычно автоматически становится активным. Если у тебя несколько пушек, активную выбирай через `/weapon id:<id>`. Именно активное оружие участвует в дуэлях.",
        commands: ["/weaponshop", "/buy", "/weapon"],
        keywords: ["купить оружие", "экипировать", "активное оружие"],
      },
      {
        id: "combat-duel",
        question: "Как считается победитель в `/duel`?",
        answer: "Дуэль идёт раундами. Оба игрока одновременно получают урон в пределах диапазона, заданного их активным оружием. На выходе система сравнивает остаток здоровья и определяет победителя. Ничья тоже возможна. Ставка переводится победителю, а участники получают кулдаун на следующую дуэль.",
        commands: ["/duel"],
        keywords: ["дуэль", "как работает", "урон", "ставка"],
      },
      {
        id: "combat-no-weapon",
        question: "Можно ли драться без оружия?",
        answer: "Да. Если у игрока нет активного оружия, дуэль не ломается: система использует слабый базовый урон ближнего боя. Это лучше, чем ничего, но против нормального вооружения шансов заметно меньше.",
        commands: ["/duel", "/weapon"],
        keywords: ["без оружия", "кулаки", "дуэль без пушки"],
      },
      {
        id: "combat-repair",
        question: "Зачем нужен `/repair`?",
        answer: "В расширенной SAMP-системе оружие изнашивается, поэтому `/repair` восстанавливает его состояние за деньги. Если активно участвуешь в PvP, ремонт нужен, чтобы не просаживать эффективность и не терять ценность дорогого вооружения.",
        commands: ["/repair", "/duel"],
        keywords: ["починить оружие", "repair", "прочность", "durability"],
      },
    ],
  },
  {
    id: "casino",
    title: "Казино и азартные игры",
    summary: "Слоты, блэкджек и рулетка со ставками и диапазонами риска.",
    commands: ["/slots", "/blackjack", "/roulette"],
    keywords: ["казино", "слоты", "блэкджек", "рулетка", "ставки"],
    questions: [
      {
        id: "casino-slots",
        question: "Как работают `/slots`?",
        answer: "`/slots` принимает ставку от `$100` до `$100,000`. Команда крутит три символа и даёт разные множители в зависимости от совпадений. Это быстрый высокорисковый способ умножить деньги, но так же быстро можно уйти в минус, если играть без лимита банка.",
        commands: ["/slots"],
        keywords: ["слоты", "автоматы", "slots"],
      },
      {
        id: "casino-blackjack",
        question: "Какой смысл в `/blackjack`?",
        answer: "`/blackjack` — ставка на классический 21. Диапазон ставки: от `$500` до `$500,000`. Это более управляемая азартная команда, чем слоты: здесь важен результат раздачи, а натуральный блэкджек даёт повышенную выплату по сравнению с обычной победой.",
        commands: ["/blackjack"],
        keywords: ["блэкджек", "21", "blackjack"],
      },
      {
        id: "casino-roulette",
        question: "Как работает `/roulette` и чем отличается зелёное?",
        answer: "`/roulette` принимает ставку от `$100` до `$500,000`. Можно ставить на красное, чёрное или зелёное. Красное и чёрное безопаснее, но зелёное платит кратно больше и потому заметно рискованнее. Это режим для тех, кто сознательно играет в высокий variance, а не фармит стабильно.",
        commands: ["/roulette"],
        keywords: ["рулетка", "green", "red", "black", "roulette"],
      },
    ],
  },
  {
    id: "businesses",
    title: "Бизнесы и пассивный доход",
    summary: "Как покупать бизнесы, зачем их обслуживать и почему доход может проседать.",
    commands: ["/businesses", "/buybiz", "/bizstats", "/mbizstats", "/collectincome", "/maintainbiz", "/bizrun"],
    keywords: ["бизнес", "пассивный доход", "доход", "обслуживание", "bizrun"],
    questions: [
      {
        id: "biz-buy",
        question: "Как купить бизнес и можно ли владеть несколькими?",
        answer: "Список объектов открывается через `/businesses`, а покупка идёт через `/buybiz`. Игрок может собирать портфель из разных бизнесов, но один и тот же бизнес повторно купить нельзя. Это не одноразовая кнопка денег: после покупки им нужно управлять, иначе эффективность упадёт.",
        commands: ["/businesses", "/buybiz"],
        keywords: ["купить бизнес", "несколько бизнесов", "buybiz"],
      },
      {
        id: "biz-income",
        question: "Почему бизнес приносит меньше, чем я ожидал?",
        answer: "Доход зависит не только от базовой цены бизнеса, но и от его состояния, запасов, live-ops множителей и территориальных бонусов. Если ты долго не обслуживаешь бизнес, эффективность падает, а вместе с ней падает и чистая прибыль при `/collectincome`.",
        commands: ["/collectincome", "/bizstats", "/mbizstats"],
        keywords: ["мало дохода", "эффективность", "состояние", "запасы"],
      },
      {
        id: "biz-maintain",
        question: "Зачем нужен `/maintainbiz`?",
        answer: "`/maintainbiz` восстанавливает состояние и запасы бизнеса. Без этого бизнес деградирует: прибыль проседает, а активное развитие тормозится. Если у тебя несколько объектов, обслуживание становится обязательной частью экономического цикла, а не косметической опцией.",
        commands: ["/maintainbiz", "/bizstats"],
        keywords: ["обслуживание", "maintainbiz", "запасы", "состояние бизнеса"],
      },
      {
        id: "biz-run",
        question: "Что делает `/bizrun`?",
        answer: "`/bizrun` — это ручная работа на конкретном бизнесе. Команда даёт дополнительную выплату, может улучшить состояние объекта и повышает ценность активного управления. Это полезно, если ты не хочешь ограничиваться чисто пассивным сбором дохода.",
        commands: ["/bizrun"],
        keywords: ["bizrun", "ручная работа", "ручной буст"],
      },
    ],
  },
  {
    id: "gangs",
    title: "Банды, территории и поддержка",
    summary: "Создание банд, захват районов и помощь бизнесам из казны банды.",
    commands: ["/gang", "/gmap", "/gcapture", "/gsupportbiz"],
    keywords: ["банда", "территория", "район", "казна", "gang"],
    questions: [
      {
        id: "gang-create",
        question: "Как создать банду и что для этого нужно?",
        answer: "Банда создаётся через `/gang create name:<название> tag:<тег>`. Создание стоит денег из личного баланса лидера, после чего он получает роль лидера банды, а сама банда получает собственную казну. Вступление и управление составом дальше идут уже через подкоманды `/gang`.",
        commands: ["/gang"],
        keywords: ["создать банду", "gang create", "тег банды", "лидер"],
      },
      {
        id: "gang-treasury",
        question: "Зачем банде казна?",
        answer: "Казна — это общий ресурс банды. В неё можно вносить деньги, а затем тратить их на территориальные действия и поддержку бизнесов членов банды. То есть сильная банда — это не только список игроков, а полноценный командный экономический бустер.",
        commands: ["/gang deposit", "/gsupportbiz", "/gcapture"],
        keywords: ["казна", "treasury", "внести деньги", "gang deposit"],
      },
      {
        id: "gang-territories",
        question: "Что дают территории и зачем нужен `/gcapture`?",
        answer: "Территории — это районы San Andreas с контролем и давлением. Через `/gcapture` банда либо захватывает, либо укрепляет район, либо продавливает контроль соперников. Контроль территории даёт бонусы связанным бизнесам банды в этой зоне, поэтому борьба за районы — это прямое продолжение экономики, а не отдельный мини-режим.",
        commands: ["/gmap", "/gcapture"],
        keywords: ["терра", "территория", "район", "захват"],
      },
      {
        id: "gang-support",
        question: "Что делает `/gsupportbiz`?",
        answer: "`/gsupportbiz` позволяет банде потратить деньги из казны на поддержку бизнеса участника. Это улучшает его состояние и даёт краткосрочный буст. Команда нужна, чтобы экономика банды реально помогала игрокам, а не лежала мёртвым балансом.",
        commands: ["/gsupportbiz"],
        keywords: ["support biz", "помощь бизнесу", "казна банды"],
      },
    ],
  },
  {
    id: "jobs-heists",
    title: "Работы дня, ограбления и баунти",
    summary: "Ежедневные задания, кооперативные ограбления, контракты на игроков и редкие подсистемы.",
    commands: ["/jobs", "/dojob", "/heist", "/bounty", "/bountylist", "/shopcosmetics", "/lottery", "/blackmarket", "/usejailpass", "/userepairkit", "/disguise", "/hottip", "/secretheist", "/wiretap", "/sabotage", "/gangbmorder"],
    keywords: ["jobs", "heist", "bounty", "лотерея", "косметика", "черный рынок"],
    questions: [
      {
        id: "jobs-board",
        question: "Что такое `/jobs` и `/dojob`?",
        answer: "`/jobs` показывает список заданий дня, а `/dojob number:<1-3>` запускает выбранную работу. Это не то же самое, что `/work`: задания обычно жирнее по выплате, но имеют собственные требования и более длинные откаты. Это хороший слой среднего прогресса между базовым фармом и серьёзным кооп-геймплеем.",
        commands: ["/jobs", "/dojob"],
        keywords: ["работы дня", "daily jobs", "dojob"],
      },
      {
        id: "heist-how",
        question: "Как работает `/heist`?",
        answer: "`/heist` собирает кооперативную группу на ограбление выбранного тира. У каждого тира есть минимальный и максимальный размер пати, диапазон награды, шанс провала и срок тюрьмы при неудаче. После запуска участники получают откат; опытные игроки с высокими message-бейджами получают сокращённый кулдаун на следующие ограбления.",
        commands: ["/heist", "/badges"],
        keywords: ["ограбление", "heist", "кооп", "кулдаун"],
      },
      {
        id: "bounty-how",
        question: "Зачем нужны `/bounty` и `/bountylist`?",
        answer: "`/bounty` позволяет назначить награду за голову другого игрока за свои деньги. `/bountylist` показывает активные цели. Если цель проигрывает дуэль, победитель может дополнительно забрать активный баунти. Это добавляет PvP-рынок и делает дуэли важнее обычной ставки.",
        commands: ["/bounty", "/bountylist", "/duel"],
        keywords: ["награда за голову", "контракт", "bounty"],
      },
      {
        id: "rare-systems",
        question: "Для чего нужны косметика, лотерея и чёрный рынок?",
        answer: "`/shopcosmetics` и `/buycosmetic` дают титулы и цвета оформления профилей/эмбедов. `/lottery` — это недельная лотерея на общий банк. `/blackmarket` — обновлённый чёрный рынок с 14 товарами, дилерами, риском облавы и системой репутации. Предметы реально работают: броня и аптечка — в дуэлях, NOS — в гонках, отмывка — снижает штрафы, маскировка — защита от PvP. Новые команды: `/usejailpass`, `/userepairkit`, `/disguise`, `/hottip`, `/secretheist`, `/wiretap`, `/sabotage`, `/gangbmorder`.",
        commands: ["/shopcosmetics", "/buycosmetic", "/lottery", "/blackmarket", "/usejailpass", "/userepairkit", "/disguise", "/hottip", "/secretheist", "/wiretap", "/sabotage", "/gangbmorder"],
        keywords: ["косметика", "лотерея", "blackmarket", "титулы", "чёрный рынок", "дилер", "облава"],
      },
    ],
  },
  {
    id: "levels",
    title: "Уровни, ранги и общий прогресс",
    summary: "Серверная XP-система, ранги GTA SA и связь общего прогресса с SAMP Life.",
    commands: ["/level", "/levels-top"],
    keywords: ["уровни", "xp", "ранги", "как качаться", "progress"],
    questions: [
      {
        id: "levels-up",
        question: "Как повышать уровень?",
        answer: "Уровень растёт не от отдельной SAMP-команды, а от обычной активности на сервере. За сообщения начисляется `15–25 XP`, но не чаще, чем раз в cooldown на одного игрока. Чем активнее ты общаешься, тем больше XP и тем выше общий уровень. Смотреть прогресс можно через `/level`, а таблицу лидеров — через `/levels-top`.",
        commands: ["/level", "/levels-top"],
        keywords: ["как апнуть уровень", "как повысить уровень", "повысить уровень", "апнуть уровень", "xp", "level up", "сообщения"],
      },
      {
        id: "levels-samp-link",
        question: "Связаны ли уровни с SAMP Life или это отдельная система?",
        answer: "Это общесерверная система, но она уже частично влияет на SAMP Life. Самая прямая связь сейчас — заработок `/work`: чем выше общий уровень, тем лучше доход с подработки. Кроме того, уровни участвуют в рангах, перках и потенциальных наградах через панель правил.",
        commands: ["/work", "/level"],
        keywords: ["отдельная система", "связь с samp", "влияет ли уровень"],
      },
      {
        id: "levels-ranks",
        question: "Какие ранги существуют по уровням?",
        answer: "Ранги стилизованы под GTA SA: от `Бродяги` и `Уличного пацана` до `Дона`, `Легенды SA` и `Бога San Andreas`. Это не просто косметика интерфейса: ранги визуально показывают глубину активности игрока и могут использоваться как триггеры для серверных перков.",
        commands: ["/level"],
        keywords: ["ранги", "бродяга", "бог san andreas", "титул уровня"],
      },
    ],
  },
  {
    id: "badges",
    title: "Бейджи, перки и XP-бусты",
    summary: "Что дают бейджи, как они выдаются и почему это не просто декоративные значки.",
    commands: ["/badges", "/level"],
    keywords: ["бейджи", "ачивки", "перки", "xp бусты", "роли"],
    questions: [
      {
        id: "badges-purpose",
        question: "Зачем вообще нужны бейджи?",
        answer: "Бейджи — это не просто коллекция иконок. Во-первых, они показывают прогресс по сообщениям, стрикам и реакциям. Во-вторых, именно бейджи и уровни могут быть триггерами для серверных `perk rules`, то есть автоматической выдачи Discord-ролей и других наград. В некоторых SAMP-механиках бейджи ещё и реально сокращают кулдауны, например на heist.",
        commands: ["/badges", "/heist"],
        keywords: ["зачем бейджи", "для чего значки", "перки", "награды"],
      },
      {
        id: "badges-types",
        question: "Какие бейджи есть на сервере?",
        answer: "Есть три основные группы: `message badges` за количество сообщений, `streak badges` за непрерывные дни активности и `reaction badges` за отправленные и полученные реакции. Плюс существуют специальные event-бейджи, которые выдаются вручную или по отдельным событиям. Посмотреть свои значки можно через `/badges`.",
        commands: ["/badges"],
        keywords: ["типы бейджей", "какие есть значки", "badges"],
      },
      {
        id: "badges-thresholds",
        question: "Какие пороги у бейджей?",
        answer: "По сообщениям пороги идут от `100` до `100,000`. По стрикам — `7`, `14`, `30`, `90` и `365` дней. По реакциям есть отдельные пороги для отправленных и полученных реакций. Это значит, что бейджи закрывают и активность в чате, и социальное поведение, а не только сухой message count.",
        commands: ["/badges", "/streak", "/reactions"],
        keywords: ["пороги", "thresholds", "100 сообщений", "365 дней"],
      },
      {
        id: "badges-perks",
        question: "Что такое перки и XP-бусты?",
        answer: "Перки и XP-бусты настраиваются администраторами через панель. Перк может автоматически выдать Discord-роль за конкретный бейдж или уровень. XP-бусты привязываются к ролям и увеличивают XP за сообщения. То есть общая система прогресса может реально менять статус игрока на сервере, а не просто рисовать эмбед.",
        commands: ["/badges", "/level"],
        keywords: ["perk", "xp multiplier", "буст xp", "автороль"],
      },
    ],
  },
  {
    id: "streaks-wanted",
    title: "Стрики и wanted stars",
    summary: "Ежедневная активность и серверный розыск, который многие путают с SAMP-полицией.",
    commands: ["/streak", "/mystrikes"],
    keywords: ["стрик", "wanted", "звезды", "розыск", "активность"],
    questions: [
      {
        id: "streak-how",
        question: "Как работает стрик активности?",
        answer: "Стрик растёт, если ты пишешь сообщения каждый день. Если пропускаешь день, текущий стрик сбрасывается, но лучший стрик остаётся в истории. Стрик считается в серверной системе активности и важен для `/daily`, бейджей и общего ощущения прогресса. Проверять его удобно через `/streak`.",
        commands: ["/streak", "/daily", "/badges"],
        keywords: ["серия", "каждый день", "пропуск дня", "streak"],
      },
      {
        id: "wanted-meaning",
        question: "Что такое wanted stars и зачем они нужны?",
        answer: "Wanted stars — это не часть SAMP-экономики, а GTA-стилизованный индикатор нарушений антиспам-системы. Если игрок часто триггерит rate-limit или защиту, он получает звёзды розыска. Это скорее модерационный статус, а не игровая полиция в экономике.",
        commands: ["/mystrikes"],
        keywords: ["wanted", "звезды", "розыск", "антиспам"],
      },
      {
        id: "wanted-decay",
        question: "Звёзды wanted снимаются сами или нет?",
        answer: "Да. Wanted stars со временем спадают автоматически. Базовая логика — одна звезда уходит примерно раз в `2 часа`, если игрок не продолжает получать новые нарушения. Поэтому система наказывает спам, но не держит человека в вечном розыске.",
        commands: ["/mystrikes"],
        keywords: ["спадают", "сбрасываются", "2 часа", "decay"],
      },
    ],
  },
  {
    id: "activities",
    title: "Trivia, radio и недельные награды",
    summary: "Фановые активности сервера, которые тоже входят в общий игровой контур.",
    commands: ["/trivia", "/trivia-top", "/trivia-stats", "/radio", "/radio-top", "/awards"],
    keywords: ["trivia", "radio", "awards", "викторина", "радио", "неделя"],
    questions: [
      {
        id: "activities-trivia",
        question: "Что такое `/trivia`?",
        answer: "`/trivia` — это викторина по GTA, а не только по San Andreas. Вопросы идут с вариантами ответа, на выбор даётся ограниченное время, а правильные ответы поднимают очки и стрик викторины. Для рейтингов есть `/trivia-top`, а для личной статистики — `/trivia-stats`.",
        commands: ["/trivia", "/trivia-top", "/trivia-stats"],
        keywords: ["викторина", "тривия", "gta quiz"],
      },
      {
        id: "activities-radio",
        question: "Зачем нужна система радио?",
        answer: "`/radio` — это голосование за любимые радиостанции мира GTA. Можно голосовать, менять голос, смотреть общий топ и дополнительную информацию. Это не система дохода, а скорее серверная активность и способ собирать вкусы комьюнити.",
        commands: ["/radio", "/radio-top", "/radio-info", "/radio-fans"],
        keywords: ["радио", "голосование", "станция", "radio"],
      },
      {
        id: "activities-weekly-awards",
        question: "Что такое недельные награды `/awards`?",
        answer: "Недельные награды собирают лучших игроков недели по нескольким категориям и автоматически подводят итоги. Победители могут получать не только упоминание, но и награды в виде SAMP-денег и XP. Это связка между активностью комьюнити и экономикой/прогрессом.",
        commands: ["/awards", "/weekly"],
        keywords: ["awards", "награды недели", "еженедельные награды"],
      },
    ],
  },
  {
    id: "servers",
    title: "Статус серверов и полезные просмотровые команды",
    summary: "Что можно посмотреть по игре и серверу, если нужен не заработок, а информация.",
    commands: ["/balance", "/richest", "/weekly", "/sampstatus"],
    keywords: ["статус сервера", "баланс", "рейтинг", "просмотр"],
    questions: [
      {
        id: "servers-balance",
        question: "Что показывает `/balance`?",
        answer: "`/balance` — это главный профиль SAMP Life. Он показывает деньги, активную машину, активное оружие и статус игрока, включая тюремный таймер, если ты сидишь. Если куплены косметические титулы или цвета, они тоже отражаются в эмбеде профиля.",
        commands: ["/balance"],
        keywords: ["профиль", "баланс", "что показывает balance"],
      },
      {
        id: "servers-richest",
        question: "Для чего нужен `/richest`?",
        answer: "`/richest` показывает топ самых богатых игроков в SAMP Life. Это быстрый способ понять, кто реально доминирует в экономике, и сравнить своё развитие с другими без захода в панель.",
        commands: ["/richest"],
        keywords: ["топ богатых", "лидеры экономики", "richest"],
      },
      {
        id: "servers-status",
        question: "Что делает `/sampstatus`?",
        answer: "`/sampstatus` относится не к экономике персонажа, а к мониторингу реальных SA-MP серверов. Команда нужна администраторам для настройки трекеров статуса и публикации онлайна серверов в Discord. Для обычного игрока это скорее инфраструктурная команда, а не часть персонального прогресса.",
        commands: ["/sampstatus"],
        keywords: ["онлайн сервера", "статус самп сервера", "sampstatus"],
      },
    ],
  },
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/["'`]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEARCH_STOPWORDS = new Set([
  "а",
  "без",
  "в",
  "во",
  "где",
  "для",
  "до",
  "же",
  "зачем",
  "и",
  "из",
  "или",
  "к",
  "как",
  "какая",
  "какие",
  "какой",
  "ли",
  "на",
  "надо",
  "но",
  "о",
  "об",
  "от",
  "по",
  "под",
  "почему",
  "при",
  "про",
  "с",
  "со",
  "так",
  "что",
  "это",
]);

function truncateText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function getGameFaqTopic(topicId) {
  return GAME_FAQ_TOPICS.find((topic) => topic.id === topicId) || null;
}

function getFaqTopicChoices() {
  return GAME_FAQ_TOPICS.map((topic) => ({ name: topic.title, value: topic.id }));
}

function getSearchScore(query, topic, entry) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const question = normalizeText(entry.question);
  const answer = normalizeText(entry.answer);
  const topicTitle = normalizeText(topic.title);
  const topicSummary = normalizeText(topic.summary);
  const keywordText = normalizeText([...(topic.keywords || []), ...(entry.keywords || [])].join(" "));
  const commandText = normalizeText([...(topic.commands || []), ...(entry.commands || [])].join(" "));
  const tokens = normalizedQuery
    .split(" ")
    .filter((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token));

  let score = 0;

  if (question.includes(normalizedQuery)) score += 80;
  if (topicTitle.includes(normalizedQuery)) score += 50;
  if (keywordText.includes(normalizedQuery)) score += 45;
  if (commandText.includes(normalizedQuery)) score += 35;
  if (answer.includes(normalizedQuery)) score += 25;
  if (topicSummary.includes(normalizedQuery)) score += 20;

  for (const token of tokens) {
    if (question.includes(token)) score += 12;
    if (keywordText.includes(token)) score += 10;
    if (topicTitle.includes(token)) score += 8;
    if (commandText.includes(token)) score += 6;
    if (answer.includes(token)) score += 4;
    if (topicSummary.includes(token)) score += 3;
  }

  return score;
}

function searchGameFaq(query, { topicId = null, limit = 5 } = {}) {
  const topics = topicId ? GAME_FAQ_TOPICS.filter((topic) => topic.id === topicId) : GAME_FAQ_TOPICS;
  const matches = [];

  for (const topic of topics) {
    for (const entry of topic.questions) {
      const score = getSearchScore(query, topic, entry);
      if (score > 0) {
        matches.push({ topic, entry, score });
      }
    }
  }

  return matches
    .sort((left, right) => right.score - left.score || left.topic.title.localeCompare(right.topic.title, "ru"))
    .slice(0, Math.max(1, limit));
}

function formatCommands(commands) {
  const items = (commands || []).filter(Boolean);
  if (!items.length) return "-";
  return items.join(" ");
}

function renderFaqOverviewEmbed() {
  const topicLines = GAME_FAQ_TOPICS.map((topic) => `• **${topic.title}** — ${topic.summary}`);

  return new EmbedBuilder()
    .setTitle("📘 Игровой FAQ")
    .setDescription(
      "FAQ покрывает SAMP Life экономику и общие игровые системы сервера: уровни, бейджи, стрики, trivia, radio и недельные награды.\n\n" +
      "Использование:\n" +
      "• `/faq` — показать обзор тем\n" +
      "• `/faq topic:<тема>` — открыть конкретный раздел\n" +
      "• `/faq question:<вопрос>` — найти точный ответ\n" +
      "• `/faq topic:<тема> question:<вопрос>` — искать только внутри выбранного раздела"
    )
    .addFields(
      {
        name: "Темы",
        value: truncateText(topicLines.join("\n"), 1024),
        inline: false,
      },
      {
        name: "Примеры запросов",
        value: [
          "`question: как повысить уровень`",
          "`question: зачем нужны бейджи`",
          "`topic: businesses`",
          "`topic: cars question: как продать машину`",
        ].join("\n"),
        inline: false,
      }
    )
    .setColor(0xf59e0b)
    .setTimestamp();
}

function renderFaqTopicEmbed(topic) {
  const questionLines = topic.questions.map((entry) => `• ${entry.question}`);

  return new EmbedBuilder()
    .setTitle(`📚 FAQ — ${topic.title}`)
    .setDescription(topic.summary)
    .addFields(
      {
        name: "Ключевые команды",
        value: truncateText(formatCommands(topic.commands), 1024),
        inline: false,
      },
      {
        name: "Частые вопросы",
        value: truncateText(questionLines.join("\n"), 1024),
        inline: false,
      }
    )
    .setColor(0x3b82f6)
    .setFooter({ text: "Добавь question, если нужен точный ответ по разделу" })
    .setTimestamp();
}

function renderFaqAnswerEmbed(match, relatedMatches = []) {
  const { topic, entry } = match;
  const related = relatedMatches
    .filter((candidate) => candidate.entry.id !== entry.id)
    .slice(0, 3)
    .map((candidate) => `• ${candidate.entry.question}`);

  const embed = new EmbedBuilder()
    .setTitle(`📖 FAQ — ${topic.title}`)
    .setDescription(`**Вопрос:** ${entry.question}\n\n${entry.answer}`)
    .addFields({
      name: "Полезные команды",
      value: truncateText(formatCommands(entry.commands?.length ? entry.commands : topic.commands), 1024),
      inline: false,
    })
    .setColor(0x22c55e)
    .setTimestamp();

  if (related.length > 0) {
    embed.addFields({
      name: "Смотри также",
      value: truncateText(related.join("\n"), 1024),
      inline: false,
    });
  }

  return embed;
}

function renderFaqNoResultsEmbed(query, topic) {
  return new EmbedBuilder()
    .setTitle("❓ Ответ не найден")
    .setDescription(
      `Не удалось найти точный FAQ-ответ по запросу **${truncateText(query, 150)}**${topic ? ` в разделе **${topic.title}**` : ""}.\n\n` +
      "Попробуй короче сформулировать вопрос или открыть нужный раздел через параметр `topic`."
    )
    .addFields({
      name: "Что можно спросить",
      value: [
        "• как начать играть",
        "• как повышать уровень",
        "• зачем нужны бейджи",
        "• как работает heist",
        "• как выйти из тюрьмы",
      ].join("\n"),
      inline: false,
    })
    .setColor(0xef4444)
    .setTimestamp();
}

async function handleGameFaqCommand(interaction) {
  const topicId = interaction.options.getString("topic", false);
  const question = String(interaction.options.getString("question", false) || "").trim();
  const topic = topicId ? getGameFaqTopic(topicId) : null;

  if (!question && !topic) {
    await interaction.reply({ embeds: [renderFaqOverviewEmbed()] });
    return;
  }

  if (!question && topic) {
    await interaction.reply({ embeds: [renderFaqTopicEmbed(topic)] });
    return;
  }

  const matches = searchGameFaq(question, { topicId, limit: 4 });
  if (!matches.length) {
    await interaction.reply({ embeds: [renderFaqNoResultsEmbed(question, topic)] });
    return;
  }

  await interaction.reply({ embeds: [renderFaqAnswerEmbed(matches[0], matches)] });
}

function getGameFaqCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("faq")
      .setDescription("Игровой FAQ по SAMP Life, уровням, бейджам и активностям")
      .addStringOption((option) => {
        option
          .setName("topic")
          .setDescription("Раздел FAQ")
          .setRequired(false);

        for (const choice of getFaqTopicChoices()) {
          option.addChoices(choice);
        }
        return option;
      })
      .addStringOption((option) =>
        option
          .setName("question")
          .setDescription("Что именно ты хочешь узнать")
          .setRequired(false)
      ),
  ];
}

function buildGameFaqMarkdown() {
  const lines = [];

  lines.push("# Игровой FAQ JepsenCloud Bot");
  lines.push("");
  lines.push("Этот документ собран по текущей реализации игровых систем в коде бота. Он покрывает не только SAMP Life экономику, но и общие игровые системы сервера: уровни, бейджи, стрики, trivia, radio, weekly awards и related utility-команды.");
  lines.push("");
  lines.push("Важно:");
  lines.push("- Уровни, стрики, бейджи и часть наград являются общесерверными системами и уже влияют на некоторые механики SAMP Life.");
  lines.push("- Wanted stars относятся к антиспам/модерации, а не к полицейской системе внутри экономики SAMP Life.");
  lines.push("- Этот файл является пользовательской документацией; канонические FAQ-данные для команды `/faq` лежат в `src/features/game-faq.js`.");
  lines.push("");
  lines.push("## Разделы");
  lines.push("");

  for (const topic of GAME_FAQ_TOPICS) {
    lines.push(`- **${topic.title}** — ${topic.summary}`);
  }

  lines.push("");

  for (const topic of GAME_FAQ_TOPICS) {
    lines.push(`## ${topic.title}`);
    lines.push("");
    lines.push(topic.summary);
    lines.push("");
    lines.push(`Команды: ${formatCommands(topic.commands)}`);
    lines.push("");

    for (const entry of topic.questions) {
      lines.push(`### ${entry.question}`);
      lines.push("");
      lines.push(entry.answer);
      if (entry.commands && entry.commands.length > 0) {
        lines.push("");
        lines.push(`Полезные команды: ${formatCommands(entry.commands)}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

const GAME_FAQ_DOC_GROUPS = [
  {
    key: "faq-start",
    title: "📘 FAQ — Старт, деньги и базовый цикл",
    description: "Быстрый вход в SAMP Life: регистрация, первые деньги, тюрьма и базовые риски.",
    topicIds: ["start", "economy", "casino"],
    color: 0xf59e0b,
  },
  {
    key: "faq-systems",
    title: "📘 FAQ — Машины, оружие и бизнесы",
    description: "Основные игровые подсистемы, на которых строится экономический прогресс игрока.",
    topicIds: ["cars", "combat", "businesses"],
    color: 0xef4444,
  },
  {
    key: "faq-progress",
    title: "📘 FAQ — Банды, ограбления и прогресс",
    description: "Командная игра, кооперативный контент и общая система развития на сервере.",
    topicIds: ["gangs", "jobs-heists", "levels", "badges"],
    color: 0x22c55e,
  },
  {
    key: "faq-community",
    title: "📘 FAQ — Серверные активности и помощь",
    description: "Стрики, wanted, trivia, radio, weekly awards и способы быстро найти ответ через `/faq`.",
    topicIds: ["streaks-wanted", "activities", "servers"],
    color: 0x3b82f6,
  },
];

function splitTextNicely(value, maxLength) {
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const parts = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const slice = remaining.slice(0, maxLength + 1);
    const candidateIndexes = [
      slice.lastIndexOf("\n\n"),
      slice.lastIndexOf(". "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("? "),
      slice.lastIndexOf("; "),
      slice.lastIndexOf(", "),
      slice.lastIndexOf(" "),
    ].filter((index) => index >= 0);

    const cutIndex = candidateIndexes.length > 0 ? Math.max(...candidateIndexes) : -1;
    const safeIndex = cutIndex >= Math.floor(maxLength * 0.6) ? cutIndex + 1 : maxLength;
    const part = remaining.slice(0, safeIndex).trim();

    if (!part) break;
    parts.push(part);
    remaining = remaining.slice(safeIndex).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

function buildTopicDocFields(topic) {
  const fields = [];

  for (const entry of topic.questions) {
    const fullText = `${entry.answer}\n\nПолезные команды: ${formatCommands(entry.commands?.length ? entry.commands : topic.commands)}`;
    const chunks = splitTextNicely(fullText, 1024);

    chunks.forEach((chunk, index) => {
      fields.push({
        name: index === 0 ? entry.question : `${entry.question} (продолжение ${index + 1})`,
        value: chunk,
        inline: false,
      });
    });
  }

  return fields;
}

function countEmbedCharacters(embed) {
  let total = 0;
  total += String(embed.title || "").length;
  total += String(embed.description || "").length;
  total += String(embed.footer?.text || "").length;
  total += String(embed.author?.name || "").length;

  for (const field of embed.fields || []) {
    total += String(field.name || "").length;
    total += String(field.value || "").length;
  }

  return total;
}

function buildFaqGroupHeaderEmbed(group, part, totalParts, index) {
  return {
    title: part === 1 ? group.title : `${group.title} — часть ${part}/${totalParts}`,
    description: `${group.description}\n\nПолная справка доступна через **/faq** прямо в Discord.`,
    color: group.color,
    footer: { text: `Игровой FAQ • пост ${index + 1}/${GAME_FAQ_DOC_GROUPS.length}` },
  };
}

function buildFaqTopicDocEmbed(topic, color) {
  return {
    title: topic.title,
    description: `${topic.summary}\n\nКоманды раздела: ${formatCommands(topic.commands)}`,
    color,
    fields: buildTopicDocFields(topic),
  };
}

function packFaqGroupPosts(group, index, topics) {
  const topicEmbeds = topics.map((topic) => buildFaqTopicDocEmbed(topic, group.color));
  const packed = [];
  let current = [];
  let currentChars = 0;

  for (const embed of topicEmbeds) {
    const embedChars = countEmbedCharacters(embed);
    const wouldExceedEmbedCount = current.length >= 9;
    const wouldExceedCharLimit = currentChars + embedChars > 5400;

    if (current.length > 0 && (wouldExceedEmbedCount || wouldExceedCharLimit)) {
      packed.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(embed);
    currentChars += embedChars;
  }

  if (current.length > 0) packed.push(current);

  return packed.map((embeds, partIndex) => {
    const header = buildFaqGroupHeaderEmbed(group, partIndex + 1, packed.length, index);
    const lookupTitle = header.title;
    const lookupTitles =
      partIndex === 0 && packed.length > 1
        ? [group.title, `${group.title} — часть 1/${packed.length}`]
        : [lookupTitle];

    return {
      label: partIndex === 0 ? group.key : `${group.key}-part-${partIndex + 1}`,
      lookupTitle,
      lookupTitles,
      embeds: [header, ...embeds],
    };
  });
}

function buildGameFaqDocsPosts() {
  return GAME_FAQ_DOC_GROUPS.flatMap((group, index) => {
    const topics = group.topicIds
      .map((topicId) => getGameFaqTopic(topicId))
      .filter(Boolean);

    return packFaqGroupPosts(group, index, topics);
  });
}

const GAME_FAQ_CHAT_PREFIXES = [
  "samp-rp",
  "samp rp",
  "samprp",
  "samp",
  "самп-рп",
  "сампрп",
  "самп",
  "бот",
  "faq",
];

const GAME_FAQ_QUERY_HINTS = [
  "как",
  "зачем",
  "почему",
  "где",
  "что",
  "сколько",
  "можно ли",
  "уровень",
  "бейдж",
  "тюрьм",
  "бизнес",
  "heist",
  "faq",
];

const gameFaqChatCooldowns = new Map();

function getGameFaqChatConfig() {
  const enabledRaw = process.env.GAME_FAQ_CHAT_ENABLED;
  const enabled = enabledRaw == null ? true : enabledRaw === "1" || enabledRaw === "true";
  const cooldownMs = Math.max(0, Number.parseInt(process.env.GAME_FAQ_CHAT_COOLDOWN_MS || "45000", 10) || 45000);
  const minScore = Math.max(1, Number.parseInt(process.env.GAME_FAQ_CHAT_MIN_SCORE || "15", 10) || 15);
  const minStrongScore = Math.max(minScore, Number.parseInt(process.env.GAME_FAQ_CHAT_STRONG_SCORE || "18", 10) || 18);
  const minGap = Math.max(0, Number.parseInt(process.env.GAME_FAQ_CHAT_MIN_GAP || "8", 10) || 8);
  const channels = String(process.env.GAME_FAQ_CHAT_CHANNELS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return { enabled, cooldownMs, minScore, minStrongScore, minGap, channels };
}

function stripBotMention(content, clientUserId) {
  if (!clientUserId) return String(content || "").trim();
  return String(content || "")
    .replace(new RegExp(`<@!?${clientUserId}>`, "g"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

function startsWithFaqPrefix(text) {
  const normalized = normalizeText(text);
  return GAME_FAQ_CHAT_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function looksLikeFaqQuestion(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (text.includes("?")) return true;
  return GAME_FAQ_QUERY_HINTS.some((hint) => normalized.includes(hint));
}

function stripFaqPrefixes(text) {
  let result = String(text || "").trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of GAME_FAQ_CHAT_PREFIXES) {
      const prefixRegex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[,:!\-\s]*`, "i");
      const updated = result.replace(prefixRegex, "").trim();
      if (updated !== result) {
        result = updated;
        changed = true;
      }
    }
  }
  return result;
}

function isGameFaqChannelAllowed(channelId, config) {
  if (!config.channels.length) return true;
  return config.channels.includes(String(channelId));
}

function isGameFaqChatOnCooldown(channelId, cooldownMs) {
  const nextAt = gameFaqChatCooldowns.get(String(channelId)) || 0;
  return Date.now() < nextAt + cooldownMs;
}

function bumpGameFaqChatCooldown(channelId) {
  gameFaqChatCooldowns.set(String(channelId), Date.now());
}

function buildGameFaqChatEmbed(match, score) {
  const { topic, entry } = match;
  return new EmbedBuilder()
    .setTitle(`🤖 Подсказка — ${topic.title}`)
    .setDescription(`**${entry.question}**\n\n${truncateText(entry.answer, 700)}`)
    .addFields({
      name: "Полезные команды",
      value: truncateText(formatCommands(entry.commands?.length ? entry.commands : topic.commands), 1024),
      inline: false,
    })
    .setColor(0x14b8a6)
    .setFooter({ text: `Полный раздел: /faq topic:${topic.id} • score ${score}` })
    .setTimestamp();
}

async function tryAnswerGameFaqInChat(message) {
  try {
    const config = getGameFaqChatConfig();
    if (!config.enabled) return false;
    if (!message?.guild || !message?.channel || !message?.author || message.author.bot) return false;
    if (!isGameFaqChannelAllowed(message.channel.id, config)) return false;
    if (isGameFaqChatOnCooldown(message.channel.id, config.cooldownMs)) return false;

    const rawContent = String(message.content || "").trim();
    if (!rawContent || rawContent.startsWith("/")) return false;
    if (rawContent.length < 6 || rawContent.length > 320) return false;

    const clientUserId = message.client?.user?.id || null;
    const directAddress = Boolean(message.mentions?.users?.has?.(clientUserId)) || startsWithFaqPrefix(rawContent);
    if (!directAddress && !looksLikeFaqQuestion(rawContent)) return false;

    const stripped = stripFaqPrefixes(stripBotMention(rawContent, clientUserId));
    const query = stripped || rawContent;
    const matches = searchGameFaq(query, { limit: 3 });
    if (!matches.length) return false;

    const [best, second] = matches;
    const scoreGap = second ? best.score - second.score : best.score;
    if (best.score < config.minScore) return false;
    if (!directAddress && best.score < config.minStrongScore) return false;
    if (second && scoreGap < config.minGap && best.score < config.minStrongScore + 10) return false;

    bumpGameFaqChatCooldown(message.channel.id);
    await message.reply({
      embeds: [buildGameFaqChatEmbed(best, best.score)],
      allowedMentions: { repliedUser: false },
    });
    return true;
  } catch (error) {
    console.error("[game-faq] chat autoanswer error:", error);
    return false;
  }
}

module.exports = {
  GAME_FAQ_TOPICS,
  getGameFaqTopic,
  searchGameFaq,
  getGameFaqCommandBuilders,
  handleGameFaqCommand,
  buildGameFaqMarkdown,
  buildGameFaqDocsPosts,
  tryAnswerGameFaqInChat,
};