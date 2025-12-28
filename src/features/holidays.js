"use strict";

const axios = require("axios");
const cheerio = require("cheerio");
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");

// Use shared DB helpers
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

// -------------------------
// DATE HELPERS
// -------------------------
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toISODate(dateObj) {
  const y = dateObj.getFullYear();
  const m = pad2(dateObj.getMonth() + 1);
  const d = pad2(dateObj.getDate());
  return `${y}-${m}-${d}`;
}
function parseISODate(s) {
  // expects YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // midday UTC to avoid DST edge
  return dt;
}
function humanRuDate(iso) {
  const dt = parseISODate(iso);
  if (!dt) return iso;
  const fmt = new Intl.DateTimeFormat("ru-RU", { year: "numeric", month: "long", day: "numeric" });
  return fmt.format(dt);
}

// -------------------------
// HOLIDAY SOURCE (calend.ru)
// -------------------------
function calendUrlForISODate(iso) {
  // calend.ru day pages use /day/YYYY-MM-DD/
  return `https://www.calend.ru/day/${iso}/`;
}

function normalizeTitle(t) {
  return (t || "")
    .replace(/[\u00A0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueList(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function isJunkTitle(t) {
  const low = t.toLowerCase();
  const junk = new Set([
    "праздники",
    "именины",
    "хроника",
    "персоны дня",
    "все праздники в этот день",
    "в народном календаре",
    "сегодня",
    "завтра",
    "послезавтра",
  ]);
  if (junk.has(low)) return true;
  if (low.length < 3) return true;
  return false;
}
function getBlockedWordsFromEnv() {
  // Comma-separated words/phrases, case-insensitive.
  // Example: HOLIDAYS_BLOCKLIST_WORDS="война,военный,армия,вооружён"
  const raw = String(process.env.HOLIDAYS_BLOCKLIST_WORDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return raw;
}

function isWarRelatedTitle(t) {
  const s = (t || "").toLowerCase();

  // Default blocklist (Russian) — tuned for “anything to do with war/military”
  // You can add/remove items later via HOLIDAYS_BLOCKLIST_WORDS.
  const defaultNeedles = [
    "войн",          // война, войны
    "военн",         // военный, военная, военно-
    "арм",           // армия, армейский
    "вооруж",        // вооруженные, вооружённых
    "боев",          // боевой, боевых
    "фронт",         // фронт
    "битв",          // битва
    "побед",         // победа (often war-related; remove if you want to keep)
    "защитник",      // защитника
    "ветеран",       // ветеран
    "мобилизац",     // мобилизация
    "оккупац",       // оккупация
    "освобожд",      // освобождение (often in war context)
    "геро",          // герой/герои (often war days; remove if too broad)
    "памяти павших", // memorial wording
  ];

  const envNeedles = getBlockedWordsFromEnv();
  const needles = envNeedles.length ? envNeedles : defaultNeedles;

  return needles.some((n) => n && s.includes(n.toLowerCase()));
}

function filterTitles(titles) {
  return (titles || []).filter((t) => !isJunkTitle(t) && !isWarRelatedTitle(t));
}

/**
 * IMPORTANT:
 * calend.ru day pages contain BOTH:
 * - holiday title link
 * - a long description link with the same href
 * - huge “countries/categories” directories elsewhere
 *
 * We only want the “title” once per holiday item.
 *
 * The holiday pages on calend use href like: /holidays/0/0/<id>/
 * Country directories are different (e.g. /holidays/russtate/), so we filter by /holidays/0/0/.
 */
async function fetchCalendTitlesByISODate(iso) {
  const url = process.env.HOLIDAYS_SOURCE_URL || calendUrlForISODate(iso);

  if (process.env.HOLIDAYS_DEBUG === "1") {
    console.log(`[holidays] fetch url=${url}`);
  }

  const res = await axios.get(url, {
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    },
  });

  const $ = cheerio.load(res.data);

  const titles = [];

  const push = (txt) => {
    const t = normalizeTitle(txt);
    if (!t) return;
    if (isJunkTitle(t)) return;
    titles.push(t);
  };

  // 1) Best path: iterate list items and take the FIRST holiday link per item.
  // This prevents capturing the long description (which is a later <a> in the same <li>).
  $("li").each((_, li) => {
    const a = $(li).find('a[href*="/holidays/0/0/"]').first();
    if (!a || !a.length) return;
    push(a.text());
  });

  // 2) If layout changes and the list isn't in <li>, fallback to any holiday-link anchors
  // but apply a strict "short title" heuristic.
  if (titles.length === 0) {
    $('a[href*="/holidays/0/0/"]').each((_, a) => {
      const txt = normalizeTitle($(a).text());
      if (!txt) return;
      // titles are typically short; descriptions are much longer
      if (txt.length > 140) return;
      push(txt);
    });
  }

  const cleaned = uniqueList(titles).filter((t) => !isJunkTitle(t));

  if (process.env.HOLIDAYS_DEBUG === "1") {
    console.log(`[holidays] parsed titles=${cleaned.length}`);
    console.log(cleaned.slice(0, 10));
  }

  // sensible cap for embeds
  return cleaned.slice(0, 50);
}

// -------------------------
// SQLITE HOLIDAYS (manual control)
// -------------------------
async function ensureHolidayTable(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,              -- YYYY-MM-DD
      title TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `
  );
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date)`);
}

async function listManualHolidays(db, iso) {
  return dbAll(db, `SELECT id, date, title, note, created_at FROM holidays WHERE date = ? ORDER BY id ASC`, [iso]);
}

async function addManualHoliday(db, iso, title, note = "") {
  const t = normalizeTitle(title);
  if (!t) throw new Error("Empty title");
  await dbRun(db, `INSERT INTO holidays(date, title, note) VALUES(?,?,?)`, [iso, t, note || ""]);
}

async function removeManualHoliday(db, id) {
  await dbRun(db, `DELETE FROM holidays WHERE id = ?`, [id]);
}

// -------------------------
// DISCORD: EMBED + COMMANDS
// -------------------------
function buildHolidayEmbed({ iso, titles, notePrefix = "" }) {
  const human = humanRuDate(iso);
  const maxItems = 25;

  const list = (titles || []).slice(0, maxItems).map((t) => `• ${t}`).join("\n");
  const extra = titles.length > maxItems ? `\n\n…и ещё: ${titles.length - maxItems}` : "";
  const desc = (notePrefix ? `${notePrefix}\n\n` : "") + (list || "Праздники не найдены.") + extra;

  return new EmbedBuilder()
    .setTitle(`Праздники на ${human}`)
    .setDescription(desc)
    .setFooter({ text: "Источник: calend.ru (и/или вручную в панели)" })
    .setTimestamp(new Date());
}

function getHolidayCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("holiday")
      .setDescription("Праздники: посмотреть/добавить/удалить (ручные) и получить из calend.ru")
      .addSubcommand((s) => s.setName("today").setDescription("Показать праздники на сегодня"))
      .addSubcommand((s) =>
        s
          .setName("date")
          .setDescription("Показать праздники на выбранную дату (YYYY-MM-DD)")
          .addStringOption((o) => o.setName("value").setDescription("Дата YYYY-MM-DD").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Добавить ручной праздник на дату (требует Manage Server)")
          .addStringOption((o) => o.setName("date").setDescription("YYYY-MM-DD").setRequired(true))
          .addStringOption((o) => o.setName("title").setDescription("Название").setRequired(true))
          .addStringOption((o) => o.setName("note").setDescription("Заметка (необязательно)").setRequired(false))
      )
      .addSubcommand((s) =>
        s
          .setName("list")
          .setDescription("Список ручных праздников на дату")
          .addStringOption((o) => o.setName("date").setDescription("YYYY-MM-DD").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription("Удалить ручной праздник по ID (требует Manage Server)")
          .addIntegerOption((o) => o.setName("id").setDescription("ID из /holiday list").setRequired(true))
      ),
  ];
}

async function fetchHolidayTitlesForToday() {
  const now = new Date();
  const iso = toISODate(now);
  const titles = await fetchCalendTitlesByISODate(iso);
  return { iso, titles };
}

async function fetchHolidayTitlesForISODate(iso) {
  const titles = await fetchCalendTitlesByISODate(iso);
  return { iso, titles };
}

async function handleHolidayCommand(interaction, { db } = {}) {
  const sub = interaction.options.getSubcommand();
  const isManager =
    interaction.memberPermissions &&
    interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild);

  // Anything that might take > 2–3s: defer.
  await interaction.deferReply({ ephemeral: true });

  try {
    if (sub === "today") {
      const iso = toISODate(new Date());
      const manual = db ? await listManualHolidays(db, iso) : [];
      const manualTitles = manual.map((r) => r.title);

      const remote = await fetchCalendTitlesByISODate(iso);
      const merged = uniqueList([...manualTitles, ...remote]);

      const embed = buildHolidayEmbed({
        iso,
        titles: merged,
        notePrefix: manualTitles.length ? `Ручные: ${manualTitles.length}, Calend.ru: ${remote.length}` : "",
      });

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "date") {
      const iso = interaction.options.getString("value");
      if (!parseISODate(iso)) return interaction.editReply("Неверный формат даты. Используй YYYY-MM-DD.");

      const manual = db ? await listManualHolidays(db, iso) : [];
      const manualTitles = manual.map((r) => r.title);

      const remote = await fetchCalendTitlesByISODate(iso);
      const merged = uniqueList([...manualTitles, ...remote]);

      const embed = buildHolidayEmbed({
        iso,
        titles: merged,
        notePrefix: manualTitles.length ? `Ручные: ${manualTitles.length}, Calend.ru: ${remote.length}` : "",
      });

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === "add") {
      if (!db) return interaction.editReply("DB не подключена.");
      if (!isManager) return interaction.editReply("Нужны права: Manage Server.");

      const iso = interaction.options.getString("date");
      const title = interaction.options.getString("title");
      const note = interaction.options.getString("note") || "";

      if (!parseISODate(iso)) return interaction.editReply("Неверный формат даты. Используй YYYY-MM-DD.");

      await addManualHoliday(db, iso, title, note);
      const rows = await listManualHolidays(db, iso);

      return interaction.editReply(`Добавлено. Теперь на ${iso} ручных записей: ${rows.length}.`);
    }

    if (sub === "list") {
      if (!db) return interaction.editReply("DB не подключена.");

      const iso = interaction.options.getString("date");
      if (!parseISODate(iso)) return interaction.editReply("Неверный формат даты. Используй YYYY-MM-DD.");

      const rows = await listManualHolidays(db, iso);
      if (!rows.length) return interaction.editReply(`На ${iso} ручных праздников нет.`);

      const lines = rows.map((r) => `#${r.id} — ${r.title}${r.note ? ` (${r.note})` : ""}`);
      return interaction.editReply(`Ручные праздники на ${iso}:\n${lines.join("\n")}`);
    }

    if (sub === "remove") {
      if (!db) return interaction.editReply("DB не подключена.");
      if (!isManager) return interaction.editReply("Нужны права: Manage Server.");

      const id = interaction.options.getInteger("id");
      const row = await dbGet(db, `SELECT id, date, title FROM holidays WHERE id = ?`, [id]);
      if (!row) return interaction.editReply("Не найдено.");

      await removeManualHoliday(db, id);
      return interaction.editReply(`Удалено: #${row.id} (${row.date}) — ${row.title}`);
    }

    return interaction.editReply("Неизвестная команда.");
  } catch (e) {
    console.error("[holiday] command error:", e);
    return interaction.editReply("Ошибка при получении праздников. Проверь логи / HOLIDAYS_DEBUG=1.");
  }
}

// -------------------------
// DAILY POSTING
// -------------------------
function msUntilNextTimeLocal(hours, minutes) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Supports BOTH call styles:
 * 1) startDailyHolidayPosts(client, { db, guildId, channelId, hour, minute })
 * 2) startDailyHolidayPosts({ client, db, guildId, channelId, hour, minute })
 */
function startDailyHolidayPosts(arg1, arg2) {
  let client;
  let opts;

  if (arg1 && typeof arg1 === "object" && arg1.client) {
    client = arg1.client;
    opts = arg1;
  } else {
    client = arg1;
    opts = arg2 || {};
  }

  const { db, guildId, channelId, hour = 9, minute = 0 } = opts;

  if (!guildId || !channelId) {
    console.log("[holidays] daily posts disabled (missing HOLIDAYS_GUILD_ID / HOLIDAYS_CHANNEL_ID).");
    return null;
  }

  const tick = async () => {
    try {
      const iso = toISODate(new Date());
      const manual = db ? await listManualHolidays(db, iso) : [];
      const manualTitles = manual.map((r) => r.title);

      const remote = await fetchCalendTitlesByISODate(iso);
      const merged = uniqueList([...manualTitles, ...remote]);

      const embed = buildHolidayEmbed({ iso, titles: merged });

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return console.warn("[holidays] guild not found:", guildId);

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) return console.warn("[holidays] channel not found/text:", channelId);

      await channel.send({ embeds: [embed] });
      console.log(`[holidays] posted daily holidays for ${iso}`);
    } catch (e) {
      console.error("[holidays] daily post error:", e);
    }
  };

  let stopped = false;

  const scheduleNext = () => {
    if (stopped) return;
    const wait = msUntilNextTimeLocal(hour, minute);
    setTimeout(async () => {
      if (stopped) return;
      await tick();
      scheduleNext();
    }, wait);
  };

  scheduleNext();

  return {
    stop() {
      stopped = true;
    },
  };
}

// -------------------------
// PANEL API HELPERS
// -------------------------
async function panelList(db, iso) {
  return listManualHolidays(db, iso);
}
async function panelAdd(db, iso, title, note) {
  if (!parseISODate(iso)) throw new Error("Invalid date format (YYYY-MM-DD)");
  await addManualHoliday(db, iso, title, note || "");
  return listManualHolidays(db, iso);
}
async function panelRemove(db, id) {
  await removeManualHoliday(db, id);
}

module.exports = {
  ensureHolidayTable,

  getHolidayCommandBuilders,
  handleHolidayCommand,

  fetchHolidayTitlesForToday,
  fetchHolidayTitlesForISODate,

  startDailyHolidayPosts,

  // panel helpers
  panelList,
  panelAdd,
  panelRemove,
};

/* 
# reload unit files (only needed if you edited the .service file)
sudo systemctl daemon-reload

# restart the bot
sudo systemctl restart jepsencloud-bot.service

# check status (full, no pager)
sudo systemctl status jepsencloud-bot.service --no-pager -l
*/