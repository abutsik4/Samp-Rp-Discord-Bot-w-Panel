"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

/**
 * GTA Trivia System
 * Timed quiz questions about GTA lore with leaderboard.
 *
 * Error codes:
 *   TRIVIA-001: Table creation failed
 *   TRIVIA-002: Score update failed
 *   TRIVIA-003: Score lookup failed
 *   TRIVIA-004: Question delivery failed
 */

const SAN_ANDREAS_QUESTIONS = [
  { q: "Кто предал CJ в начале игры?", answers: ["Big Smoke", "Ryder", "OG Loc", "Sweet"], correct: 0 },
  { q: "Как называется банда CJ?", answers: ["Grove Street Families", "Ballas", "Vagos", "Triads"], correct: 0 },
  { q: "В каком городе начинается GTA San Andreas?", answers: ["Лос-Сантос", "Сан-Фиерро", "Лас-Вентурас", "Либерти-Сити"], correct: 0 },
  { q: "Какого цвета банда Ballas?", answers: ["Фиолетовый", "Зеленый", "Красный", "Синий"], correct: 0 },
  { q: "Как зовут брата CJ?", answers: ["Sweet", "Ryder", "Big Smoke", "Cesar"], correct: 0 },
  { q: "Какая радиостанция играет хип-хоп в GTA San Andreas?", answers: ["Radio Los Santos", "K-DST", "Radio X", "SF-UR"], correct: 0 },
  { q: "На какой улице живет CJ?", answers: ["Grove Street", "Main Street", "Ocean Drive", "Vinewood Boulevard"], correct: 0 },
  { q: "Как называется главное казино мафии в Лас-Вентурасе?", answers: ["Caligula's Palace", "The Visage", "Pirates in Men's Pants", "Four Dragons"], correct: 0 },
  { q: "Кто лидер триад в Сан-Фиерро?", answers: ["Ву Зи Му", "Ran Fa Li", "Jizzy B", "Mike Toreno"], correct: 0 },
  { q: "Какой максимальный уровень розыска в GTA San Andreas?", answers: ["6 звезд", "5 звезд", "4 звезды", "7 звезд"], correct: 0 },
  { q: "Как называется спортзал в районе Ganton?", answers: ["Ganton Gym", "Muscle House", "Los Santos Fitness", "Gold Muscle"], correct: 0 },
  { q: "Какую культовую реплику произносит Big Smoke при заказе еды?", answers: ["I'll have two number 9s...", "Give me all the fries", "Just a soda", "No onions, man"], correct: 0 },
  { q: "Как зовут сестру CJ?", answers: ["Kendl", "Denise", "Catalina", "Maria"], correct: 0 },
  { q: "Кто такой Officer Tenpenny?", answers: ["Коррумпированный полицейский", "Лидер триад", "Механик", "Продавец оружия"], correct: 0 },
  { q: "Какой актер озвучил CJ?", answers: ["Young Maylay", "Samuel L. Jackson", "Ice-T", "50 Cent"], correct: 0 },
  { q: "Кто озвучил Officer Tenpenny?", answers: ["Samuel L. Jackson", "Young Maylay", "Ice Cube", "MC Eiht"], correct: 0 },
  { q: "Какой военный самолет можно угнать в San Andreas?", answers: ["Hydra", "Shamal", "Rustler", "Dodo"], correct: 0 },
  { q: "Как называется секретная военная база в GTA San Andreas?", answers: ["Area 69", "Fort Zancudo", "Area 51", "Black Project Base"], correct: 0 },
  { q: "Какой бизнес CJ может купить в Сан-Фиерро?", answers: ["Автосервис", "Киностудию", "Гольф-клуб", "Больницу"], correct: 0 },
  { q: "Как зовут девушку CJ из Лос-Сантоса?", answers: ["Denise Robinson", "Katie Zhan", "Barbara Schternvart", "Millie Perkins"], correct: 0 },
  { q: "Как называется самая высокая гора штата San Andreas?", answers: ["Mount Chiliad", "Mount Josiah", "Shady Peak", "Mount Sorreno"], correct: 0 },
  { q: "В каком году происходят события GTA San Andreas?", answers: ["1992", "1986", "1998", "2001"], correct: 0 },
  { q: "Как называется штат, в котором происходит GTA San Andreas?", answers: ["San Andreas", "North Yankton", "Liberty", "Vice State"], correct: 0 },
  { q: "Что можно купить в Ammu-Nation?", answers: ["Все ответы верны", "Пистолет", "Дробовик", "AK-47"], correct: 0 },
  { q: "Что лучше всего помогает CJ не толстеть?", answers: ["Тренировки в зале", "Покупка одежды", "Смена машины", "Смена района"], correct: 0 },
  { q: "Как называется банда в желтом?", answers: ["Los Santos Vagos", "Ballas", "Varrios Los Aztecas", "Da Nang Boys"], correct: 0 },
  { q: "Кто помогает CJ ограбить казино Caligula's?", answers: ["Woozie и триады", "Sweet и Grove Street", "Ballas", "The Truth и Zero"], correct: 0 },
  { q: "Как называется парикмахерская рядом с домом CJ?", answers: ["Old Reece's", "Top Cuts", "Barber Kings", "Fresh Fade"], correct: 0 },
  { q: "Что произошло с мамой CJ до начала игры?", answers: ["Ее убили", "Она переехала", "Она стала копом", "Она уехала в Vice City"], correct: 0 },
  { q: "Откуда CJ вернулся в начале игры?", answers: ["Из Либерти-Сити", "Из Вайс-Сити", "Из Лас-Вентураса", "Из Сан-Фиерро"], correct: 0 },
  { q: "Как называется культовая фраза из вступления GTA San Andreas?", answers: ["Ah shit, here we go again", "Welcome back to Grove Street", "Time to roll", "Respect the hood"], correct: 0 },
  { q: "Какие сети фастфуда есть в San Andreas?", answers: ["Все ответы верны", "Cluckin' Bell", "Burger Shot", "Pizza Stack"], correct: 0 },
  { q: "Какой цвет у Grove Street Families?", answers: ["Зеленый", "Фиолетовый", "Желтый", "Красный"], correct: 0 },
  { q: "Кто такой Zero?", answers: ["Владелец магазина RC-моделей", "Полицейский информатор", "Лидер байкеров", "Продавец машин"], correct: 0 },
  { q: "Как называется знаменитый мост в Сан-Фиерро?", answers: ["Gant Bridge", "Western Bay Bridge", "Vice Bridge", "San Fierro Span"], correct: 0 },
  { q: "Чем заканчивается история GTA San Andreas?", answers: ["CJ возвращает контроль над Grove Street", "CJ уезжает из штата", "Sweet предает CJ", "Woozie становится мэром"], correct: 0 },
  { q: "Как называется аэропорт Лос-Сантоса?", answers: ["Los Santos International", "Los Santos Airport", "San Andreas International", "Carl Johnson Airfield"], correct: 0 },
  { q: "Кто такая Catalina в GTA San Andreas?", answers: ["Безумная подруга CJ", "Сестра Sweet", "Девушка Woozie", "Журналистка из San Fierro"], correct: 0 },
  { q: "Какие виды спорта доступны в GTA San Andreas?", answers: ["Все ответы верны", "Баскетбол", "Пул", "Велосипедные заезды"], correct: 0 },
  { q: "Какой район считается территорией Ballas?", answers: ["Idlewood", "Doherty", "Roca Escalante", "Verdant Bluffs"], correct: 0 },
  { q: "Кто такой The Truth?", answers: ["Хиппи-фермер", "Адвокат мафии", "Дилер оружия", "Телеведущий"], correct: 0 },
  { q: "Какая радиостанция ассоциируется с альтернативным роком в GTA San Andreas?", answers: ["Radio X", "Playback FM", "K-JAH West", "Bounce FM"], correct: 0 },
  { q: "Что можно делать в казино Four Dragons?", answers: ["Играть в азартные игры", "Покупать дома", "Летать на самолетах", "Строить бизнес"], correct: 0 },
  { q: "Как называется пиццерия в GTA San Andreas?", answers: ["Pizza Stack", "Well Stacked Pizza", "Vice Slice", "Pizzamania"], correct: 1 },
  { q: "Какая максимальная мускулатура у CJ?", answers: ["100%", "75%", "50%", "Без ограничения"], correct: 0 },
  { q: "Кто такой Madd Dogg?", answers: ["Рэпер", "Коррумпированный коп", "Автогонщик", "Лидер Vagos"], correct: 0 },
  { q: "Как называется ферма The Truth?", answers: ["The Farm", "Truth Ranch", "Green Acres", "Back O' Beyond Farm"], correct: 0 },
  { q: "Как называется устройство, которое можно найти в Area 69?", answers: ["Jetpack", "Hover Belt", "Rocket Boots", "Sky Harness"], correct: 0 },
  { q: "Как расшифровывается имя CJ?", answers: ["Carl Johnson", "Chris Jackson", "Cesar Junior", "Calvin James"], correct: 0 },
  { q: "Кто возглавляет Varrios Los Aztecas?", answers: ["Cesar Vialpando", "T-Bone Mendez", "Ryder", "Jethro"], correct: 0 },
  { q: "Кто говорит фразу про поезд в миссии Wrong Side of the Tracks?", answers: ["Big Smoke", "Sweet", "CJ", "Ryder"], correct: 0 },
  { q: "Какой город в GTA San Andreas основан на Сан-Франциско?", answers: ["Сан-Фиерро", "Лос-Сантос", "Лас-Вентурас", "Паломино-Крик"], correct: 0 },
  { q: "Какой город в GTA San Andreas основан на Лас-Вегасе?", answers: ["Лас-Вентурас", "Сан-Фиерро", "Лос-Сантос", "Angel Pine"], correct: 0 },
  { q: "В каком районе Сан-Фиерро находится автошкола?", answers: ["Doherty", "Queens", "Paradiso", "Juniper Hollow"], correct: 0 },
  { q: "Как называется аэродром, который покупает CJ?", answers: ["Verdant Meadows", "Green Palms", "Hunter Field", "Bone Strip"], correct: 0 },
  { q: "Где проходит летная школа в GTA San Andreas?", answers: ["Verdant Meadows", "Los Santos Airport", "Area 69", "Easter Bay Airport"], correct: 0 },
  { q: "В каком округе находится Area 69?", answers: ["Bone County", "Red County", "Flint County", "Tierra Robada"], correct: 0 },
  { q: "Какая радиостанция играет кантри в GTA San Andreas?", answers: ["K-Rose", "CSR 103.9", "Master Sounds 98.3", "WCTR"], correct: 0 },
  { q: "Какая радиостанция играет классический рок в GTA San Andreas?", answers: ["K-DST", "Bounce FM", "K-JAH West", "Radio Los Santos"], correct: 0 },
  { q: "Кто выдает задания с RC-техникой в Сан-Фиерро?", answers: ["Zero", "The Truth", "Jizzy B", "Cesar"], correct: 0 },
  { q: "Как называется миссия с погоней за поездом?", answers: ["Wrong Side of the Tracks", "End of the Line", "Drive-By", "Pier 69"], correct: 0 },
  { q: "Кто такой Mike Toreno?", answers: ["Таинственный правительственный агент", "Лидер Ballas", "Радиоведущий", "Владелец казино"], correct: 0 },
];

const VICE_CITY_QUESTIONS = [
  { q: "Кто главный герой GTA Vice City?", answers: ["Tommy Vercetti", "Claude", "Victor Vance", "Toni Cipriani"], correct: 0 },
  { q: "Какой актер озвучил Tommy Vercetti?", answers: ["Ray Liotta", "Samuel L. Jackson", "Michael Madsen", "Dennis Hopper"], correct: 0 },
  { q: "В каком году происходят события GTA Vice City?", answers: ["1986", "1992", "2001", "1984"], correct: 0 },
  { q: "Какой город лежит в основе Vice City?", answers: ["Майами", "Лос-Анджелес", "Чикаго", "Лас-Вегас"], correct: 0 },
  { q: "Кто отправляет Tommy в Vice City в начале игры?", answers: ["Sonny Forelli", "Ken Rosenberg", "Ricardo Diaz", "Lance Vance"], correct: 0 },
  { q: "Как зовут адвоката Tommy в начале игры?", answers: ["Ken Rosenberg", "Ken Paul", "Avery Carrington", "Steve Scott"], correct: 0 },
  { q: "Кто является крупным наркобароном в Vice City?", answers: ["Ricardo Diaz", "Mitch Baker", "Auntie Poulet", "Umberto Robina"], correct: 0 },
  { q: "Как называется особняк, который Tommy получает после Diaz?", answers: ["Vercetti Estate", "Diaz Palace", "Vice Manor", "Starfish Mansion"], correct: 0 },
  { q: "Кто помогает Tommy после предательства в начале игры?", answers: ["Lance Vance", "Sonny Forelli", "Phil Cassidy", "Victor Vance"], correct: 0 },
  { q: "Какую фамилию носит Sonny?", answers: ["Forelli", "Sindacco", "Leone", "Vercetti"], correct: 0 },
  { q: "Кто такой Colonel Cortez?", answers: ["Военный и контрабандист", "Полицейский комиссар", "Радиоведущий", "Владелец автосалона"], correct: 0 },
  { q: "Кто возглавляет байкеров в Vice City?", answers: ["Mitch Baker", "Phil Cassidy", "Lance Vance", "Avery Carrington"], correct: 0 },
  { q: "Как называется рок-группа, с которой работает Tommy?", answers: ["Love Fist", "Vice Beats", "V-Rockers", "The Sharks"], correct: 0 },
  { q: "Какой клуб Tommy покупает для подготовки ограбления банка?", answers: ["Malibu Club", "Pole Position Club", "Ocean Club", "Studio 69"], correct: 0 },
  { q: "Как называется стрип-клуб, который можно купить в игре?", answers: ["Pole Position Club", "Malibu Club", "Cherry Popper Club", "Vice Lounge"], correct: 0 },
  { q: "Как называется служба такси, которую может купить Tommy?", answers: ["Kaufman Cabs", "Vice Taxis", "Sun Cabs", "Ocean Rides"], correct: 0 },
  { q: "Как называется автосалон, связанный с экспортом машин?", answers: ["Sunshine Autos", "Vice Imports", "Ocean Motors", "Cortez Cars"], correct: 0 },
  { q: "Какой бизнес маскирует продажу наркотиков под мороженое?", answers: ["Cherry Popper Ice Cream Factory", "Pole Position Club", "Sunshine Autos", "Boatyard"], correct: 0 },
  { q: "Как называется киностудия, которую может приобрести Tommy?", answers: ["InterGlobal Films", "Vice Pictures", "Oceanic Studios", "Starlight Films"], correct: 0 },
  { q: "Кто лидер кубинцев в Vice City?", answers: ["Umberto Robina", "Auntie Poulet", "Ricardo Diaz", "Phil Cassidy"], correct: 0 },
  { q: "Кто дает Tommy задания от гаитян?", answers: ["Auntie Poulet", "Mercedes Cortez", "Candy Suxxx", "Mimi"], correct: 0 },
  { q: "Кто торгует оружием и помогает Tommy со взрывчаткой?", answers: ["Phil Cassidy", "Kent Paul", "Steve Scott", "Pastor Richards"], correct: 0 },
  { q: "Кто в Vice City занимается недвижимостью и стройками?", answers: ["Avery Carrington", "Sonny Forelli", "Lance Vance", "Ken Rosenberg"], correct: 0 },
  { q: "Кто такой Kent Paul?", answers: ["Музыкальный менеджер и знакомый Tommy", "Шеф полиции", "Продавец оружия", "Владелец банка"], correct: 0 },
  { q: "Какая радиостанция играет хард-рок и металл в Vice City?", answers: ["V-Rock", "Flash FM", "Emotion 98.3", "Wave 103"], correct: 0 },
  { q: "Какая радиостанция играет поп-хиты 80-х в Vice City?", answers: ["Flash FM", "VCPR", "Wildstyle", "K-Chat"], correct: 0 },
  { q: "Какая радиостанция играет диско и фанк?", answers: ["Fever 105", "Wave 103", "V-Rock", "Vice City FM"], correct: 0 },
  { q: "Какая радиостанция является разговорной в Vice City?", answers: ["VCPR", "Espantoso", "Flash FM", "Fever 105"], correct: 0 },
  { q: "Какое прозвище Tommy получил после событий в Харвуде?", answers: ["Harwood Butcher", "Vice King", "Liberty Ghost", "Forelli Dog"], correct: 0 },
  { q: "Сколько лет Tommy провел в тюрьме до начала игры?", answers: ["15", "10", "5", "20"], correct: 0 },
  { q: "Как называется остров с роскошными особняками в Vice City?", answers: ["Starfish Island", "Prawn Island", "Washington Beach", "Leaf Links"], correct: 0 },
  { q: "Какой бизнес Tommy использует как прикрытие для наркоторговли?", answers: ["Cherry Popper Ice Cream Factory", "Malibu Club", "Boatyard", "Print Works"], correct: 0 },
  { q: "Какой транспорт используется в миссии Demolition Man?", answers: ["RC-вертолет", "RC-катер", "Вертолет Hunter", "Гидроплан"], correct: 0 },
  { q: "Какую мафиозную семью возглавляет Sonny Forelli?", answers: ["Forelli Family", "Leone Family", "Sindacco Family", "Vance Family"], correct: 0 },
  { q: "Какой магазин оружия есть в Vice City?", answers: ["Ammu-Nation", "Gun World", "Vice Arms", "Patriot Defense"], correct: 0 },
  { q: "Какой бизнес на воде Tommy может приобрести?", answers: ["Boatyard", "Shipyard", "Ocean Docks", "Vice Marina"], correct: 0 },
  { q: "На каком острове находится особняк Diaz?", answers: ["Starfish Island", "Prawn Island", "Vice Point", "Little Havana"], correct: 0 },
  { q: "Какая радиостанция играет латиноамериканскую музыку в Vice City?", answers: ["Radio Espantoso", "Wildstyle", "Fever 105", "K-Chat"], correct: 0 },
  { q: "Кто такая Mercedes Cortez?", answers: ["Дочь Colonel Cortez", "Сестра Tommy", "Радиоведущая", "Владелица Malibu Club"], correct: 0 },
  { q: "Как называется торговый центр из одной из миссий Vice City?", answers: ["North Point Mall", "Vice Mall", "Ocean Plaza", "Sunset Center"], correct: 0 },
  { q: "С какой уличной бандой Tommy дружит через Umberto Robina?", answers: ["Cubans", "Haitians", "Bikers", "Sharks"], correct: 0 },
  { q: "Какая банда является врагом кубинцев?", answers: ["Haitians", "Forelli", "Bikers", "Sharks"], correct: 0 },
  { q: "Как называется типография, которая печатает фальшивые деньги?", answers: ["Print Works", "Vice Press", "Dollar House", "Sunshine Print"], correct: 0 },
  { q: "Как Tommy прибывает в Vice City в начале игры?", answers: ["На самолете", "На катере", "На поезде", "На автобусе"], correct: 0 },
  { q: "Какое место становится главной базой Tommy во второй половине игры?", answers: ["Vercetti Estate", "Ocean View Hotel", "Malibu Club", "Boatyard"], correct: 0 },
  { q: "Кто дружит с Love Fist и выводит Tommy на группу?", answers: ["Kent Paul", "Ken Rosenberg", "Mitch Baker", "Avery Carrington"], correct: 0 },
  { q: "Какой бизнес связан со съемками фильмов для взрослых?", answers: ["InterGlobal Films", "Malibu Club", "Cherry Popper", "Print Works"], correct: 0 },
  { q: "Какой актив связан со списком автомобилей на экспорт?", answers: ["Sunshine Autos", "Kaufman Cabs", "Boatyard", "Pole Position Club"], correct: 0 },
  { q: "Какая радиостанция играет медленные романтические песни?", answers: ["Emotion 98.3", "V-Rock", "Wildstyle", "Flash FM"], correct: 0 },
  { q: "Какая радиостанция играет new wave в Vice City?", answers: ["Wave 103", "Fever 105", "K-Chat", "VCPR"], correct: 0 },
  { q: "Какая радиостанция играет ранний хип-хоп и электро?", answers: ["Wildstyle", "Wave 103", "Flash FM", "Emotion 98.3"], correct: 0 },
  { q: "Кто убивает Ricardo Diaz?", answers: ["Tommy и Lance", "Sonny и Ken", "Cortez и Phil", "Haitians и Cubans"], correct: 0 },
  { q: "Что теряет Phil Cassidy после неудачного взрыва?", answers: ["Руку", "Глаз", "Машину", "Дом"], correct: 0 },
  { q: "Как называется алкогольный напиток в миссии с Phil Cassidy?", answers: ["Boomshine", "Moonshine", "Vice Rum", "Wild Turkey"], correct: 0 },
  { q: "В каком районе находится Malibu Club?", answers: ["Vice Point", "Little Haiti", "Prawn Island", "Downtown"], correct: 0 },
  { q: "В каком районе Tommy сначала живет в отеле?", answers: ["Ocean Beach", "Little Havana", "Vice Point", "Prawn Island"], correct: 0 },
  { q: "Как называется отель Tommy в начале игры?", answers: ["Ocean View Hotel", "Vice View Hotel", "Malibu Hotel", "Harbor Hotel"], correct: 0 },
  { q: "Как называется штаб Tommy после захвата империи Diaz?", answers: ["Vercetti Estate", "Diaz Villa", "Forelli Mansion", "Ocean Manor"], correct: 0 },
  { q: "Кто является финальным противником Tommy в конце Vice City?", answers: ["Sonny Forelli", "Ricardo Diaz", "Lance Vance", "Colonel Cortez"], correct: 0 },
];

const GTA_V_QUESTIONS = [
  { q: "Кто является тремя главными героями GTA V?", answers: ["Michael, Franklin и Trevor", "Niko, Roman и Packie", "Tommy, Lance и Sonny", "CJ, Sweet и Big Smoke"], correct: 0 },
  { q: "В каком городе происходит основное действие GTA V?", answers: ["Лос-Сантос", "Либерти-Сити", "Вайс-Сити", "Сан-Фиерро"], correct: 0 },
  { q: "Как называется округ с пустыней и небольшими городами в GTA V?", answers: ["Blaine County", "Red County", "Bone County", "Vice County"], correct: 0 },
  { q: "Как зовут собаку Франклина?", answers: ["Chop", "Buddy", "Buster", "Rocco"], correct: 0 },
  { q: "Какую фамилию использует Майкл в начале GTA V?", answers: ["De Santa", "Townley", "Weston", "Clinton"], correct: 0 },
  { q: "Какая настоящая фамилия Майкла?", answers: ["Townley", "De Santa", "Phillips", "Norton"], correct: 0 },
  { q: "Где происходит пролог GTA V?", answers: ["Ludendorff, North Yankton", "Vice City Beach", "San Fierro Docks", "Paleto Bay"], correct: 0 },
  { q: "Кто является главным организатором многих ограблений в GTA V?", answers: ["Lester Crest", "Lamar Davis", "Simeon Yetarian", "Martin Madrazo"], correct: 0 },
  { q: "Как зовут друга Франклина, который часто втягивает его в неприятности?", answers: ["Lamar Davis", "Jimmy De Santa", "Dave Norton", "Ron Jakowski"], correct: 0 },
  { q: "Как зовут жену Майкла?", answers: ["Amanda", "Tracey", "Tanisha", "Denise"], correct: 0 },
  { q: "Как зовут сына Майкла?", answers: ["Jimmy", "Lamar", "Fabien", "Ron"], correct: 0 },
  { q: "Как зовут дочь Майкла?", answers: ["Tracey", "Amanda", "Paige", "Tanisha"], correct: 0 },
  { q: "Где живет Trevor в начале основной истории?", answers: ["Sandy Shores", "Rockford Hills", "Vespucci Beach", "Mirror Park"], correct: 0 },
  { q: "Как называется бизнес Trevor?", answers: ["Trevor Philips Enterprises", "Blaine County Logistics", "Los Santos Freight", "Trevor Air Cargo"], correct: 0 },
  { q: "Какая компания в GTA V пародирует Facebook?", answers: ["Lifeinvader", "Bleeter", "Eyefind", "Snapmatic"], correct: 0 },
  { q: "Как называется частная военная компания в GTA V?", answers: ["Merryweather", "Gruppe Sechs", "SecuroServ", "NOOSE"], correct: 0 },
  { q: "Как зовут коррумпированного агента FIB из GTA V?", answers: ["Steve Haines", "Dave Norton", "Andreas Sanchez", "Michael De Santa"], correct: 0 },
  { q: "Кто помогает Майклу погрузиться в киноиндустрию?", answers: ["Solomon Richards", "Simeon Yetarian", "Martin Madrazo", "Wei Cheng"], correct: 0 },
  { q: "На кого Франклин работает в начале игры?", answers: ["Simeon Yetarian", "Lester Crest", "Devin Weston", "Floyd Hebert"], correct: 0 },
  { q: "Как называется автосалон Simeon Yetarian?", answers: ["Premium Deluxe Motorsport", "Luxury Autos", "San Andreas Cars", "Benny's Imports"], correct: 0 },
  { q: "Как зовут психотерапевта Майкла?", answers: ["Dr. Isiah Friedlander", "Dr. Ross", "Dr. Solomon", "Dr. Haines"], correct: 0 },
  { q: "Какая псевдорелигия высмеивается в GTA V?", answers: ["Epsilon Program", "Children of Atom", "Kifflom Society", "Trinity Order"], correct: 0 },
  { q: "Как зовут миллиардера, который конфликтует с героями в конце игры?", answers: ["Devin Weston", "Solomon Richards", "Stretch", "Ron Jakowski"], correct: 0 },
  { q: "Как зовут криминального босса, чей дом случайно сносит Майкл?", answers: ["Martin Madrazo", "Wei Cheng", "Steve Haines", "Lester Crest"], correct: 0 },
  { q: "Как называется клуб, который Trevor превращает в свою базу?", answers: ["Vanilla Unicorn", "Bahama Mamas", "Tequi-la-la", "Split Sides"], correct: 0 },
  { q: "Как называется штат, в котором находится пролог GTA V?", answers: ["North Yankton", "San Andreas", "Vice State", "Liberty"], correct: 0 },
  { q: "Какая структура является соперником FIB в GTA V?", answers: ["IAA", "LSPD", "NOOSE", "Merryweather"], correct: 0 },
  { q: "Как называется финальное крупное ограбление в GTA V?", answers: ["The Big Score", "The Bureau Raid", "Blitz Play", "The Paleto Score"], correct: 0 },
  { q: "Как называется ограбление банка в маленьком городке?", answers: ["The Paleto Score", "The Big Score", "The Jewel Store Job", "Blitz Play"], correct: 0 },
  { q: "Как называется первое крупное ограбление ювелирного магазина?", answers: ["The Jewel Store Job", "The Bureau Raid", "The Merryweather Heist", "The Big Score"], correct: 0 },
  { q: "Как называется задание с нападением на броневик и хаосом на улице?", answers: ["Blitz Play", "By the Book", "Friend Request", "Repossession"], correct: 0 },
  { q: "Кто из героев чаще всего пилотирует самолеты и вертолеты?", answers: ["Trevor", "Michael", "Franklin", "Jimmy"], correct: 0 },
  { q: "Кто из героев является бывшим профессиональным грабителем на пенсии?", answers: ["Michael", "Franklin", "Trevor", "Lamar"], correct: 0 },
  { q: "Кто из героев начинает путь как молодой уличный парень?", answers: ["Franklin", "Trevor", "Michael", "Dave"], correct: 0 },
  { q: "Как называется фирменный бренд смартфонов в GTA V?", answers: ["iFruit", "Lifephone", "Pear", "Bleeter One"], correct: 0 },
  { q: "Как называется основной интернет-поисковик в GTA V?", answers: ["Eyefind", "Lifeinvader", "Bleeter", "Snapmatic"], correct: 0 },
  { q: "Какая соцсеть в GTA V пародирует Twitter?", answers: ["Bleeter", "Lifeinvader", "Eyefind", "MyRoom"], correct: 0 },
  { q: "Кто из героев чаще всего носит грязную майку и живет в трейлере?", answers: ["Trevor", "Franklin", "Michael", "Lester"], correct: 0 },
  { q: "С кем Франклин живет в начале игры?", answers: ["С тетей Denise", "С матерью Michael", "С Trevor", "С Lester"], correct: 0 },
  { q: "Как зовут бывшую девушку Франклина?", answers: ["Tanisha", "Amanda", "Tracey", "Patricia"], correct: 0 },
  { q: "Как зовут агента FIB, который знает прошлое Майкла?", answers: ["Dave Norton", "Steve Haines", "Andreas Sanchez", "Stretch"], correct: 0 },
  { q: "Как зовут опытную хакершу, которую можно взять на ограбление?", answers: ["Paige Harris", "Molly Schultz", "Denise Clinton", "Tonya Wiggins"], correct: 0 },
  { q: "Какое ведомство герои грабят во время одной из операций?", answers: ["FIB", "IAA", "NOOSE", "LSPD"], correct: 0 },
  { q: "Как называется аэродром, который использует Trevor для побочного бизнеса?", answers: ["McKenzie Field Hangar", "Sandy Shores Airbase", "Blaine Field", "Trevor Airstrip"], correct: 0 },
  { q: "Как называется культ людей в горах, который можно встретить в GTA V?", answers: ["Altruists", "Epsilon", "Lost", "Children of the Mountain"], correct: 0 },
  { q: "Как зовут китайского криминального босса, конфликтующего с Trevor?", answers: ["Wei Cheng", "Martin Madrazo", "Devin Weston", "Stretch"], correct: 0 },
  { q: "Как зовут лидера Epsilon Program?", answers: ["Cris Formage", "Steve Haines", "Jay Norris", "Lazlow"], correct: 0 },
  { q: "Какая киностудия присутствует в GTA V?", answers: ["Richards Majestic", "Vice Pictures", "InterGlobal", "Vinewood Studio One"], correct: 0 },
  { q: "Как называется операция с военным грузом Merryweather?", answers: ["The Merryweather Heist", "The Big Score", "Blitz Play", "Caida Libre"], correct: 0 },
  { q: "Как зовут неопытного хакера, которого можно взять на ограбление?", answers: ["Rickie Lukens", "Paige Harris", "Jay Norris", "Fabien LaRouche"], correct: 0 },
  { q: "В каком районе живет Майкл?", answers: ["Rockford Hills", "Strawberry", "Sandy Shores", "Davis"], correct: 0 },
  { q: "В каком районе живет Франклин в начале GTA V?", answers: ["Strawberry", "Rockford Hills", "Paleto Bay", "Mirror Park"], correct: 0 },
  { q: "Куда Франклин переезжает позже по сюжету?", answers: ["Vinewood Hills", "Sandy Shores", "Chumash", "East Los Santos"], correct: 0 },
  { q: "Как зовут инструктора йоги, который раздражает Майкла?", answers: ["Fabien LaRouche", "Lazlow", "Jimmy", "Stretch"], correct: 0 },
  { q: "Как называется сеть оружейных магазинов в GTA V?", answers: ["Ammu-Nation", "Gun Locker", "Warstock", "Mega Arms"], correct: 0 },
  { q: "Как зовут папарацци, который дает Майклу задания?", answers: ["Beverly Felton", "Solomon Richards", "Jay Norris", "Lester Crest"], correct: 0 },
  { q: "Как зовут параноидального друга Trevor, связанного с контрабандой?", answers: ["Ron Jakowski", "Lamar Davis", "Jimmy De Santa", "Dave Norton"], correct: 0 },
  { q: "Как зовут родственника Trevor, у которого он живет в Лос-Сантосе?", answers: ["Floyd Hebert", "Stretch", "Steve Haines", "Solomon Richards"], correct: 0 },
  { q: "Какой герой умеет замедлять время за рулем?", answers: ["Franklin", "Michael", "Trevor", "Lamar"], correct: 0 },
  { q: "Какой герой умеет замедлять время в перестрелках?", answers: ["Michael", "Franklin", "Trevor", "Lester"], correct: 0 },
  { q: "Какой герой получает способность впадать в ярость и выдерживать больше урона?", answers: ["Trevor", "Franklin", "Michael", "Jimmy"], correct: 0 },
];

// 180 questions across GTA San Andreas, Vice City, and GTA V.
const TRIVIA_QUESTIONS = [
  ...SAN_ANDREAS_QUESTIONS,
  ...VICE_CITY_QUESTIONS,
  ...GTA_V_QUESTIONS,
];

const TRIVIA_TIMEOUT_SEC = 30;
const DEFAULT_TRIVIA_COOLDOWN_MS = 45_000;

const triviaUserCooldowns = new Map();
const activeTriviaUsers = new Map();
const activeTriviaChannels = new Map();

// Shuffle helper
function shuffleArray(arr, randomFn = Math.random) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getTriviaCooldownMs() {
  const parsed = Number.parseInt(process.env.TRIVIA_COOLDOWN_MS || String(DEFAULT_TRIVIA_COOLDOWN_MS), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TRIVIA_COOLDOWN_MS;
}

function getTriviaUserKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getTriviaChannelKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

function getActiveUntil(map, key, now = Date.now()) {
  const until = Number(map.get(key) || 0);
  if (until <= now) {
    map.delete(key);
    return 0;
  }
  return until;
}

function formatTriviaWait(ms) {
  return `${Math.max(1, Math.ceil(Number(ms || 0) / 1000))} сек.`;
}

function prepareTriviaQuestion(question, randomFn = Math.random) {
  const shuffledAnswers = shuffleArray(
    question.answers.map((answer, index) => ({ answer, index })),
    randomFn
  );

  return {
    ...question,
    answers: shuffledAnswers.map((entry) => entry.answer),
    correct: shuffledAnswers.findIndex((entry) => entry.index === question.correct),
  };
}

function startTriviaSession(
  { guildId, channelId, userId },
  { now = Date.now(), timeoutMs = TRIVIA_TIMEOUT_SEC * 1000, cooldownMs = getTriviaCooldownMs() } = {}
) {
  const userKey = getTriviaUserKey(guildId, userId);
  const channelKey = getTriviaChannelKey(guildId, channelId);

  const userActiveUntil = getActiveUntil(activeTriviaUsers, userKey, now);
  if (userActiveUntil) {
    return { ok: false, reason: "user-active", remainingMs: userActiveUntil - now };
  }

  const channelActiveUntil = getActiveUntil(activeTriviaChannels, channelKey, now);
  if (channelActiveUntil) {
    return { ok: false, reason: "channel-active", remainingMs: channelActiveUntil - now };
  }

  const cooldownUntil = getActiveUntil(triviaUserCooldowns, userKey, now);
  if (cooldownUntil) {
    return { ok: false, reason: "cooldown", remainingMs: cooldownUntil - now };
  }

  activeTriviaUsers.set(userKey, now + timeoutMs);
  activeTriviaChannels.set(channelKey, now + timeoutMs);
  triviaUserCooldowns.set(userKey, now + cooldownMs);

  return {
    ok: true,
    activeUntil: now + timeoutMs,
    cooldownUntil: now + cooldownMs,
  };
}

function finishTriviaSession({ guildId, channelId, userId }) {
  activeTriviaUsers.delete(getTriviaUserKey(guildId, userId));
  activeTriviaChannels.delete(getTriviaChannelKey(guildId, channelId));
}

function abortTriviaSession(context) {
  finishTriviaSession(context);
  triviaUserCooldowns.delete(getTriviaUserKey(context.guildId, context.userId));
}

function resetTriviaSessionState() {
  triviaUserCooldowns.clear();
  activeTriviaUsers.clear();
  activeTriviaChannels.clear();
}

/**
 * Ensure trivia tables exist
 */
async function ensureTriviaTable(db) {
  try {
    await dbRun(
      db,
      `
      CREATE TABLE IF NOT EXISTS trivia_scores (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        correct INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        current_streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        total_points INTEGER NOT NULL DEFAULT 0,
        weekly_points INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      )
    `
    );
    try {
      await dbRun(db, `ALTER TABLE trivia_scores ADD COLUMN weekly_points INTEGER NOT NULL DEFAULT 0`);
    } catch (_) {}
    await dbRun(
      db,
      `CREATE INDEX IF NOT EXISTS idx_trivia_scores_points ON trivia_scores(guild_id, total_points DESC)`
    );
  } catch (err) {
    console.error("[TRIVIA-001] Failed to create trivia table:", err);
    throw err;
  }
}

/**
 * Update user's trivia score
 */
async function updateTriviaScore(db, guildId, userId, isCorrect) {
  try {
    const existing = await dbGet(
      db,
      `SELECT correct, total, current_streak, best_streak, total_points FROM trivia_scores WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    const basePoints = isCorrect ? 10 : 0;
    const streakBonus = isCorrect ? Math.min((existing?.current_streak || 0) * 5, 50) : 0; // max +50 streak bonus
    const points = basePoints + streakBonus;

    if (!existing) {
      await dbRun(
        db,
        `INSERT INTO trivia_scores (guild_id, user_id, correct, total, current_streak, best_streak, total_points, weekly_points)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
        [guildId, userId, isCorrect ? 1 : 0, isCorrect ? 1 : 0, isCorrect ? 1 : 0, points, points]
      );
    } else {
      const newStreak = isCorrect ? existing.current_streak + 1 : 0;
      const newBest = Math.max(newStreak, existing.best_streak);

      await dbRun(
        db,
        `UPDATE trivia_scores
         SET correct = correct + ?, total = total + 1,
             current_streak = ?, best_streak = ?,
             total_points = total_points + ?,
             weekly_points = weekly_points + ?
         WHERE guild_id = ? AND user_id = ?`,
        [isCorrect ? 1 : 0, newStreak, newBest, points, points, guildId, userId]
      );
    }

    return { points, streakBonus };
  } catch (err) {
    console.error(`[TRIVIA-002] Score update failed for user ${userId}:`, err);
    return { points: 0, streakBonus: 0 };
  }
}

/**
 * Get user's trivia stats
 */
async function getTriviaStats(db, guildId, userId) {
  try {
    const row = await dbGet(
      db,
      `SELECT correct, total, current_streak, best_streak, total_points 
       FROM trivia_scores WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    return row || { correct: 0, total: 0, current_streak: 0, best_streak: 0, total_points: 0 };
  } catch (err) {
    console.error(`[TRIVIA-003] Score lookup failed for user ${userId}:`, err);
    return { correct: 0, total: 0, current_streak: 0, best_streak: 0, total_points: 0 };
  }
}

/**
 * Get trivia leaderboard
 */
async function getTriviaLeaderboard(db, guildId, limit = 10) {
  try {
    return await dbAll(
      db,
      `SELECT user_id, correct, total, best_streak, total_points
       FROM trivia_scores WHERE guild_id = ? AND total_points > 0
       ORDER BY total_points DESC LIMIT ?`,
      [guildId, limit]
    );
  } catch (err) {
    console.error(`[TRIVIA-003] Leaderboard lookup failed:`, err);
    return [];
  }
}

/**
 * Get random trivia question
 */
function getRandomQuestion() {
  const idx = Math.floor(Math.random() * TRIVIA_QUESTIONS.length);
  return { ...prepareTriviaQuestion(TRIVIA_QUESTIONS[idx]), index: idx };
}

/**
 * Get slash command builders for trivia
 */
function getTriviaCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("trivia")
      .setDescription("Викторина по GTA: San Andreas, Vice City и V! 🎮"),
    new SlashCommandBuilder()
      .setName("trivia-top")
      .setDescription("Топ знатоков GTA"),
    new SlashCommandBuilder()
      .setName("trivia-stats")
      .setDescription("Ваша статистика викторины")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("Пользователь (опционально)").setRequired(false)
      ),
  ];
}

/**
 * Handle trivia slash commands
 */
async function handleTriviaCommand({ interaction, db }) {
  const { commandName } = interaction;

  if (commandName === "trivia") {
    const sessionContext = {
      guildId: interaction.guildId || interaction.guild?.id,
      channelId: interaction.channelId,
      userId: interaction.user.id,
    };
    let sessionStarted = false;

    try {
      const question = getRandomQuestion();
      const session = startTriviaSession(sessionContext);
      if (!session.ok) {
        const content =
          session.reason === "channel-active"
            ? `⏳ В этом канале уже идет вопрос викторины. Подожди **${formatTriviaWait(session.remainingMs)}**.`
            : session.reason === "user-active"
            ? `⏳ У тебя уже есть активный вопрос викторины. Подожди **${formatTriviaWait(session.remainingMs)}**.`
            : `⏳ Не так быстро. Следующий /trivia будет доступен через **${formatTriviaWait(session.remainingMs)}**.`;

        await interaction.reply({ content, ephemeral: true });
        return;
      }

      sessionStarted = true;

      // Create buttons for answers
      const row = new ActionRowBuilder();
      const labels = ["🅰️", "🅱️", "🅾️", "🔷"];

      for (let i = 0; i < question.answers.length; i++) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`trivia_${i}`)
            .setLabel(`${labels[i]} ${question.answers[i]}`)
            .setStyle(ButtonStyle.Secondary)
        );
      }

      const embed = new EmbedBuilder()
        .setTitle("🎮 GTA Викторина")
        .setDescription(`**${question.q}**\n\n⏱️ У вас ${TRIVIA_TIMEOUT_SEC} секунд!`)
        .setColor(0xf59e0b)
        .setFooter({ text: "Нажмите кнопку с правильным ответом" });

      const reply = await interaction.reply({
        embeds: [embed],
        components: [row],
        fetchReply: true,
      });

      let collected;
      try {
        collected = await reply.awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === interaction.user.id,
          time: TRIVIA_TIMEOUT_SEC * 1000,
        });
      } catch {
        // Timeout
        const timeoutRow = new ActionRowBuilder();
        for (let i = 0; i < question.answers.length; i++) {
          const style = i === question.correct ? ButtonStyle.Success : ButtonStyle.Secondary;
          timeoutRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`trivia_timeout_${i}`)
              .setLabel(`${labels[i]} ${question.answers[i]}`)
              .setStyle(style)
              .setDisabled(true)
          );
        }

        const timeoutEmbed = new EmbedBuilder()
          .setTitle("⏱️ Время вышло!")
          .setDescription(`Правильный ответ: **${question.answers[question.correct]}**`)
          .setColor(0xf59e0b);

        await interaction.editReply({ embeds: [timeoutEmbed], components: [timeoutRow] });

        // Count as wrong
        await updateTriviaScore(db, interaction.guild.id, interaction.user.id, false);
        return;
      }

      const selectedIdx = parseInt(collected.customId.split("_")[1], 10);
      const isCorrect = selectedIdx === question.correct;

      const result = await updateTriviaScore(
        db,
        interaction.guild.id,
        interaction.user.id,
        isCorrect
      );

      // Disable all buttons and highlight correct/wrong
      const disabledRow = new ActionRowBuilder();
      for (let i = 0; i < question.answers.length; i++) {
        const style =
          i === question.correct
            ? ButtonStyle.Success
            : i === selectedIdx
            ? ButtonStyle.Danger
            : ButtonStyle.Secondary;
        disabledRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`trivia_done_${i}`)
            .setLabel(`${labels[i]} ${question.answers[i]}`)
            .setStyle(style)
            .setDisabled(true)
        );
      }

      const resultEmbed = new EmbedBuilder()
        .setTitle(isCorrect ? "✅ Правильно!" : "❌ Неправильно!")
        .setDescription(
          isCorrect
            ? `+${result.points} очков${result.streakBonus > 0 ? ` (бонус за серию: +${result.streakBonus})` : ""}!`
            : `Правильный ответ: **${question.answers[question.correct]}**`
        )
        .setColor(isCorrect ? 0x22c55e : 0xef4444);

      await collected.update({ embeds: [resultEmbed], components: [disabledRow] });
    } catch (err) {
      if (sessionStarted) {
        abortTriviaSession(sessionContext);
      }
      console.error("[TRIVIA-004] Question delivery failed:", err);
      const errorMsg = "❌ Ошибка при загрузке вопроса. Попробуйте снова.";
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: errorMsg }).catch(() => {});
      } else {
        await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => {});
      }
    } finally {
      if (sessionStarted) {
        finishTriviaSession(sessionContext);
      }
    }
  } else if (commandName === "trivia-top") {
    await interaction.deferReply();

    const rows = await getTriviaLeaderboard(db, interaction.guild.id, 10);
    const visible = [];

    for (const row of rows) {
      if (visible.length >= 10) break;
      let member;
      try {
        member = await interaction.guild.members.fetch(row.user_id);
      } catch {
        continue;
      }
      visible.push({ member, ...row });
    }

    if (!visible.length) {
      return interaction.editReply({ content: "Пока никто не играл в викторину. Начни первым с /trivia!" });
    }

    const lines = visible.map((e, i) => {
      const accuracy = e.total > 0 ? Math.round((e.correct / e.total) * 100) : 0;
      return `\`${i + 1}.\` **${e.member.user.tag}** — ${e.total_points} очков (${accuracy}% правильных, серия: ${e.best_streak})`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🏆 Топ знатоков GTA")
      .setDescription(lines.join("\n"))
      .setColor(0xf59e0b)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } else if (commandName === "trivia-stats") {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const stats = await getTriviaStats(db, interaction.guild.id, targetUser.id);
    const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

    const embed = new EmbedBuilder()
      .setTitle(`🎮 Статистика викторины — ${targetUser.tag}`)
      .addFields(
        { name: "🏆 Очки", value: `${stats.total_points}`, inline: true },
        { name: "✅ Правильных", value: `${stats.correct}/${stats.total} (${accuracy}%)`, inline: true },
        { name: "🔥 Текущая серия", value: `${stats.current_streak}`, inline: true },
        { name: "⭐ Лучшая серия", value: `${stats.best_streak}`, inline: true }
      )
      .setColor(0xf59e0b)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}

module.exports = {
  TRIVIA_QUESTIONS,
  ensureTriviaTable,
  updateTriviaScore,
  getTriviaStats,
  getTriviaLeaderboard,
  prepareTriviaQuestion,
  startTriviaSession,
  finishTriviaSession,
  resetTriviaSessionState,
  getRandomQuestion,
  getTriviaCommandBuilders,
  handleTriviaCommand,
};
