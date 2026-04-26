"use strict";
/**
 * SAMP Life — Onboarding Quest Chain
 *
 * 5-step quest triggered by /reg that rewards a new player with ~52k$ of
 * scaffolding plus the "Новичок" badge. Designed to shorten the "first
 * $50k" grind that currently traps 97% of registered players under $50k.
 *
 * Steps are persisted in `samp_onboarding(user_id, step, completed_at)`.
 * All trigger calls are idempotent — re-firing the same step does nothing.
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

const ONBOARDING_STEPS = [
  {
    id: 1,
    key: "work",
    title: "Первая работа",
    description: "Выполни команду **/work** один раз.",
    reward: 2_000,
    hint: "Команда /work — самый быстрый способ начать. Кулдаун всего 60 секунд.",
  },
  {
    id: 2,
    key: "truck",
    title: "Дальнобой",
    description: "Съезди на **/truck** хотя бы один раз.",
    reward: 5_000,
    hint: "Дальнобой приносит 2.5k–6.5k$ с риском аварии в 18%.",
  },
  {
    id: 3,
    key: "buy_car",
    title: "Первая тачка",
    description: "Купи любую тачку через **/buy type:car**.",
    reward: 10_000,
    hint: "Дешёвые тачки начинаются от 5,000$. Без велика далеко не уедешь.",
  },
  {
    id: 4,
    key: "pvp",
    title: "Проверка на прочность",
    description: "Поучаствуй в **/race** или **/duel** (победа не обязательна).",
    reward: 10_000,
    hint: "Даже проигрыш засчитывается — главное попробовать PvP.",
  },
  {
    id: 5,
    key: "daily",
    title: "Ежедневный ритуал",
    description: "Забери **/daily** два раза (в разные дни).",
    reward: 25_000,
    hint: "Стрик /daily растит бонус — не забывай заходить каждый день.",
    target: 2,
  },
];

const STEP_BY_KEY = Object.fromEntries(ONBOARDING_STEPS.map((s) => [s.key, s]));
const TOTAL_REWARD = ONBOARDING_STEPS.reduce((sum, s) => sum + s.reward, 0);

async function ensureOnboardingTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_onboarding (
      user_id TEXT NOT NULL,
      step INTEGER NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, step)
    )`
  );
  await dbRun(
    db,
    `CREATE INDEX IF NOT EXISTS idx_samp_onboarding_user ON samp_onboarding(user_id)`
  );
}

async function isOnboardingActive(db, userId) {
  try {
    const row = await dbGet(
      db,
      `SELECT COUNT(*) AS started FROM samp_onboarding WHERE user_id = ?`,
      [String(userId)]
    );
    return Number(row?.started || 0) > 0;
  } catch (_) {
    return false;
  }
}

async function startOnboarding(db, userId) {
  try {
    await ensureOnboardingTables(db);
    for (const step of ONBOARDING_STEPS) {
      await dbRun(
        db,
        `INSERT OR IGNORE INTO samp_onboarding(user_id, step, progress, completed_at) VALUES(?, ?, 0, NULL)`,
        [String(userId), step.id]
      );
    }
  } catch (err) {
    console.error("[samp-onboarding] startOnboarding failed", err);
  }
}

async function getOnboardingProgress(db, userId) {
  try {
    const rows = await dbAll(
      db,
      `SELECT step, progress, completed_at FROM samp_onboarding WHERE user_id = ? ORDER BY step ASC`,
      [String(userId)]
    );
    const byStep = new Map((rows || []).map((r) => [Number(r.step), r]));
    return ONBOARDING_STEPS.map((meta) => {
      const row = byStep.get(meta.id);
      return {
        ...meta,
        progress: Number(row?.progress || 0),
        completedAt: row?.completed_at || null,
        completed: Boolean(row?.completed_at),
        tracked: Boolean(row),
      };
    });
  } catch (_) {
    return ONBOARDING_STEPS.map((meta) => ({ ...meta, progress: 0, completedAt: null, completed: false, tracked: false }));
  }
}

/**
 * Record progress for an onboarding step. Idempotent: completing a
 * step more than once is a no-op.
 *
 * @returns {Promise<null | { step, reward, completed: true }>}
 *   Returns a completion record the first time the step finishes,
 *   otherwise null.
 */
async function triggerOnboardingEvent(db, userId, stepKey, { increment = 1 } = {}) {
  const meta = STEP_BY_KEY[stepKey];
  if (!meta) return null;
  try {
    await ensureOnboardingTables(db);
    const row = await dbGet(
      db,
      `SELECT progress, completed_at FROM samp_onboarding WHERE user_id = ? AND step = ?`,
      [String(userId), meta.id]
    );
    // Only track users who have started the onboarding chain.
    if (!row) return null;
    if (row.completed_at) return null;

    const target = Math.max(1, Number(meta.target || 1));
    const nextProgress = Math.min(target, Number(row.progress || 0) + Math.max(1, Number(increment) || 1));
    const completes = nextProgress >= target;

    await dbRun(
      db,
      `UPDATE samp_onboarding
       SET progress = ?, completed_at = ${completes ? "datetime('now')" : "NULL"}
       WHERE user_id = ? AND step = ?`,
      [nextProgress, String(userId), meta.id]
    );

    if (!completes) return null;
    return { step: meta, reward: meta.reward, completed: true };
  } catch (err) {
    console.error("[samp-onboarding] triggerOnboardingEvent failed", err);
    return null;
  }
}

async function getCompletedCount(db, userId) {
  try {
    const row = await dbGet(
      db,
      `SELECT COUNT(*) AS done FROM samp_onboarding WHERE user_id = ? AND completed_at IS NOT NULL`,
      [String(userId)]
    );
    return Number(row?.done || 0);
  } catch (_) {
    return 0;
  }
}

function renderOnboardingEmbed(username, steps, totalDone) {
  const lines = steps.map((s) => {
    const mark = s.completed ? "✅" : "⬜";
    const progressText = s.target && s.target > 1 && !s.completed
      ? ` (${s.progress}/${s.target})`
      : "";
    return `${mark} **Шаг ${s.id}. ${s.title}** — +${s.reward.toLocaleString("ru-RU")}$${progressText}\n└ ${s.description}`;
  });

  const allDone = totalDone >= ONBOARDING_STEPS.length;
  const summary = allDone
    ? `🎉 Все шаги пройдены! Ты заработал **${TOTAL_REWARD.toLocaleString("ru-RU")}$** бонусов.`
    : `Прогресс: **${totalDone}/${ONBOARDING_STEPS.length}** шагов • Всего бонусов: **${TOTAL_REWARD.toLocaleString("ru-RU")}$**`;

  return new EmbedBuilder()
    .setTitle("🎯 Квест новичка SAMP Life")
    .setDescription(`${summary}\n\n${lines.join("\n\n")}\n\n_Подсказка: бонус за каждый шаг приходит автоматически, сразу после выполнения._`)
    .setColor(allDone ? 0x2ecc71 : 0xf39c12)
    .setFooter({ text: `Игрок: ${username}` });
}

function getOnboardingCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("quest")
      .setDescription("SAMP Life: прогресс квеста новичка (бонусы за первые шаги)"),
  ];
}

async function handleQuestCommand(interaction, db) {
  const userId = interaction.user.id;
  await ensureOnboardingTables(db);
  const active = await isOnboardingActive(db, userId);
  if (!active) {
    await interaction.reply({
      content: "Квест новичка доступен только для свежих паспортов. Пройди **/reg**, чтобы начать, или ты уже давно в игре — и квест тебе не нужен.",
      ephemeral: true,
    });
    return;
  }
  const steps = await getOnboardingProgress(db, userId);
  const done = await getCompletedCount(db, userId);
  const embed = renderOnboardingEmbed(interaction.user.username, steps, done);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = {
  ONBOARDING_STEPS,
  TOTAL_REWARD,
  ensureOnboardingTables,
  startOnboarding,
  isOnboardingActive,
  getOnboardingProgress,
  triggerOnboardingEvent,
  getCompletedCount,
  renderOnboardingEmbed,
  getOnboardingCommandBuilders,
  handleQuestCommand,
};
