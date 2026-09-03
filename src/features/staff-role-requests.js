"use strict";

/**
 * staff-role-requests.js
 *
 * Discord-based staff role request system.
 *
 * Flow:
 *   /request-staff-role
 *     -> modal collects: target role, in-game name, server, reason, experience
 *     -> bot creates a private thread in the request hub channel
 *     -> approver (Модератор Discord) clicks Approve or Reject
 *     -> on Reject, a second modal collects the reason + advice
 *     -> 24h window for the rejecter to edit their reason
 *     -> approved = role granted, DMed, audit-logged
 *     -> rejected = DMed with reason, audit-logged
 *     -> thread renamed and locked in either case
 *
 * Approver: 👑 Модератор Discord (1384282552151445676) — re-verified on every click.
 * Cooldown: 5 minutes between rejected requests for the same (user, target role).
 *
 * All Discord components carry the customId prefix "srr:" so a single
 * dispatch branch routes them all.
 */

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    SlashCommandBuilder,
} = require("discord.js");

const { dbRun, dbGet } = require("../utils/db-helpers");

// ── Constants ──────────────────────────────────────────────────────────────

const APPROVER_ROLE_ID = "1384282552151445676"; // 👑 Модератор Discord
const HUB_CHANNEL_NAME = "📝┆заявки-на-роли";
const HUB_CHANNEL_TOPIC =
    "Заявки на выдачу staff-ролей. Используйте /request-staff-role.";
const KV_KEY_HUB_CHANNEL = "staff_role_requests_hub_channel";
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const MOD_LOG_CHANNEL_ID = "541024085283700741"; // existing Captain Hook channel

const PREFIX = "srr:";
const MODAL_REQUEST_CUSTOM_ID = `${PREFIX}request-modal`;
const MODAL_REJECT_CUSTOM_ID = `${PREFIX}reject-modal`;
const BTN_APPROVE = `${PREFIX}approve`;
const BTN_REJECT = `${PREFIX}reject`;
const BTN_EDIT_REASON = `${PREFIX}edit-reason`;
const BTN_REASSIGN = `${PREFIX}reassign`;
const EDIT_REASON_MODAL_CUSTOM_ID = `${PREFIX}edit-reason-modal`;

// Roles users can request
const REQUESTABLE_ROLES = [
    { id: "537221018465337344", short: "Админ Legacy",  long: "👨🏻\u200d💻 Администратор Legacy", server: "legacy" },
    { id: "1524383530593812490", short: "Админ Home",   long: "🔩 Администратор Home",   server: "home"   },
    { id: "537222604432343041", short: "Саппорт Legacy", long: "🙋🏼\u200d♂️ Саппорт Legacy",  server: "legacy" },
    { id: "1524384780396007437", short: "Саппорт Home",  long: "👁️ Саппорт Home",       server: "home"   },
];
const REQUESTABLE_ROLE_IDS = new Set(REQUESTABLE_ROLES.map((r) => r.id));
const roleById = (id) => REQUESTABLE_ROLES.find((r) => r.id === id);

const STATUS = Object.freeze({
    OPEN: "open",
    APPROVED: "approved",
    REJECTED: "rejected",
    CANCELLED: "cancelled",
});

// ── SQLite table ───────────────────────────────────────────────────────────

async function ensureStaffRoleRequestsTable(db) {
    await dbRun(
        db,
        `
        CREATE TABLE IF NOT EXISTS staff_role_requests (
            id                  TEXT PRIMARY KEY,
            guild_id            TEXT NOT NULL,
            thread_id           TEXT NOT NULL UNIQUE,
            requester_id        TEXT NOT NULL,
            target_role_id      TEXT NOT NULL,
            server_label        TEXT NOT NULL,
            nick                TEXT NOT NULL,
            forum_url           TEXT NOT NULL,
            social_url          TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'open',
            approver_id         TEXT,
            rejection_reason    TEXT,
            rejection_advice    TEXT,
            rejection_edited_at INTEGER,
            resolved_at         INTEGER,
            created_at          INTEGER NOT NULL
        )
        `,
    );
    await dbRun(
        db,
        `CREATE INDEX IF NOT EXISTS idx_srr_requester_target_created
             ON staff_role_requests(requester_id, target_role_id, created_at)`,
    );
    await dbRun(
        db,
        `CREATE INDEX IF NOT EXISTS idx_srr_status_created
             ON staff_role_requests(status, created_at)`,
    );
    // Idempotent column adds for upgrades from older schemas.
    // Older versions had game_name / reason / experience / in_game_contact
    // and screenshot_status; we now use nick / forum_url / social_url.
    // We don't try to drop the old columns (SQLite <3.35 doesn't support
    // it); we just add the new ones and let the new code ignore the old.
    const idempotentAlters = [
        `ALTER TABLE staff_role_requests ADD COLUMN nick TEXT`,
        `ALTER TABLE staff_role_requests ADD COLUMN forum_url TEXT`,
        `ALTER TABLE staff_role_requests ADD COLUMN social_url TEXT`,
    ];
    for (const sql of idempotentAlters) {
        try { await dbRun(db, sql); } catch (_) { /* column already exists */ }
    }
}

// ── Hub channel ────────────────────────────────────────────────────────────

async function ensureRequestHubChannel(client, guildId) {
    // Match by name only: the channel is top-level (no parent) so we must
    // not filter on c.parent. Re-runs of this script rely on this lookup
    // to avoid creating duplicate channels.
    const existing = client.channels.cache.find(
        (c) => c.guild?.id === guildId && c.name === HUB_CHANNEL_NAME,
    );
    if (existing) {
        // Best-effort cache the id; ignore kv errors (table may not exist in this project).
        try {
            await dbRun(
                client.db,
                `INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`,
                [KV_KEY_HUB_CHANNEL, existing.id],
            );
        } catch (_) { /* kv table may not exist; harmless */ }
        return existing;
    }

    const guild = await client.guilds.fetch(guildId);
    const ch = await guild.channels.create({
        name: HUB_CHANNEL_NAME,
        type: ChannelType.GuildText,
        topic: HUB_CHANNEL_TOPIC,
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny: [PermissionFlagsBits.SendMessages],
            },
            {
                id: client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ManageThreads,
                    PermissionFlagsBits.CreatePrivateThreads,
                    PermissionFlagsBits.EmbedLinks,
                ],
            },
        ],
    });
    return ch;
}

// ── Slash command builder ──────────────────────────────────────────────────

function getStaffRoleRequestCommandBuilder() {
    return new SlashCommandBuilder()
        .setName("request-staff-role")
        .setDescription("Подать заявку на staff-роль (Админ или Саппорт).")
        .addStringOption((o) =>
            o.setName("role")
                .setDescription("Какую роль вы хотите получить (сервер определяется ролью)")
                .setRequired(true)
                .addChoices(
                    REQUESTABLE_ROLES.map((r) => ({ name: r.long, value: r.id })),
                ),
        );
    // No "server" option: the server (Legacy / Home) is implied by the
    // chosen role, since each role ID is bound to one server in
    // REQUESTABLE_ROLES.
    // No defaultMemberPermissions restriction: the handler does the real
    // gating (must not already hold the target role, no cooldown, etc.).
}
// ── Modal builders ─────────────────────────────────────────────────────────

function buildRequestModal(roleId, serverLabel) {
    // roleId and serverLabel are encoded in the modal's customId so the
    // submit handler can recover them. Discord modals only support
    // TextInput (type 4) inside; selects are NOT allowed, which is why
    // the role and server are collected via the slash command's options
    // instead of via in-modal selects.
    const safeRole = (roleId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const safeServer = (serverLabel === "home" ? "home" : "legacy");
    return new ModalBuilder()
        .setCustomId(`${MODAL_REQUEST_CUSTOM_ID}:${safeRole}:${safeServer}`)
        .setTitle("Заявка на staff-роль")
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("srr_nick")
                    .setLabel("Игровой ник")
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(2)
                    .setMaxLength(32)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("srr_forum_url")
                    .setLabel("Ссылка на форумник (https://forum...)")
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(10)
                    .setMaxLength(200)
                    .setPlaceholder("https://forum.samp-rp.ru/...")
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("srr_social")
                    .setLabel("Ссылка на VK или Telegram")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder("https://vk.com/durov или https://t.me/durov")
                    .setMinLength(10)
                    .setMaxLength(200)
                    .setRequired(true),
            ),
        );
}
function buildRejectionModal(requestId) {
    return new ModalBuilder()
        .setCustomId(`${MODAL_REJECT_CUSTOM_ID}:${requestId}`)
        .setTitle("Причина отказа")
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("srr_rej_reason")
                    .setLabel("Причина (обязательно)")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMinLength(10)
                    .setMaxLength(500)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("srr_rej_advice")
                    .setLabel("Совет (необязательно)")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMinLength(0)
                    .setMaxLength(300)
                    .setRequired(false),
            ),
        );
}

function buildEditReasonModal(requestId) {
    return new ModalBuilder()
        .setCustomId(`${EDIT_REASON_MODAL_CUSTOM_ID}:${requestId}`)
        .setTitle("Изменить причину отказа")
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("srr_rej_reason")
                    .setLabel("Причина (обязательно)")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMinLength(10)
                    .setMaxLength(500)
                    .setRequired(true)
                    .setValue(""),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("srr_rej_advice")
                    .setLabel("Совет (необязательно)")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMinLength(0)
                    .setMaxLength(300)
                    .setRequired(false)
                    .setValue(""),
            ),
        );
}

// ── Embeds and components ─────────────────────────────────────────────────

function buildRequestEmbed(row, opts = {}) {
    const { state = "open", approverTag, rejectionReason, rejectionAdvice } = opts;
    const target = roleById(row.target_role_id);
    const embed = new EmbedBuilder()
        .setColor(
            state === STATUS.APPROVED
                ? 0x2ecc71
                : state === STATUS.REJECTED
                  ? 0xe74c3c
                  : 0x5865f2,
        )
        .setTitle(`Заявка на «${target?.long || row.target_role_id}»`)
        .addFields(
            { name: "Заявитель", value: `<@${row.requester_id}>`, inline: true },
            { name: "Игровой ник", value: `\`${row.nick || row.game_name || "?"}\``, inline: true },
            { name: "Сервер", value: row.server_label === "legacy" ? "Legacy" : "Home", inline: true },
            { name: "Форумник", value: row.forum_url ? `[ссылка](${row.forum_url})` : "—", inline: false },
            { name: "Соцсеть", value: row.social_url ? `[ссылка](${row.social_url})` : "—", inline: false },
        );

    if (state === STATUS.APPROVED) {
        embed.addFields({
            name: "✅ Одобрено",
            value: approverTag ? `Модератор: <@${approverTag}>` : "Одобрено",
        });
    } else if (state === STATUS.REJECTED) {
        embed.addFields({
            name: "❌ Отклонено",
            value:
                (rejectionReason ? `**Причина:** ${rejectionReason}\n` : "") +
                (rejectionAdvice ? `**Совет:** ${rejectionAdvice}` : ""),
        });
    }

    embed.setFooter({ text: `ID заявки: ${row.id}` });
    embed.setTimestamp(row.created_at ? new Date(row.created_at) : new Date());
    return embed;
}

function buildRequestActionRow(requestId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${BTN_APPROVE}:${requestId}`)
            .setLabel("Одобрить")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅"),
        new ButtonBuilder()
            .setCustomId(`${BTN_REJECT}:${requestId}`)
            .setLabel("Отклонить")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌"),
        new ButtonBuilder()
            .setCustomId(`${BTN_REASSIGN}:${requestId}`)
            .setLabel("Переоформить")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🔄"),
    );
}

function buildRejecterEditRow(requestId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${BTN_EDIT_REASON}:${requestId}`)
            .setLabel("Изменить причину (24ч)")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("✏️"),
    );
}

// ── DB helpers ─────────────────────────────────────────────────────────────

function genId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function isOnCooldown(db, requesterId, targetRoleId) {
    const lastRejected = await dbGet(
        db,
        `SELECT created_at FROM staff_role_requests
         WHERE requester_id = ? AND target_role_id = ? AND status = ?
         ORDER BY created_at DESC LIMIT 1`,
        [requesterId, targetRoleId, STATUS.REJECTED],
    );
    if (!lastRejected?.created_at) return false;
    const age = Date.now() - Number(lastRejected.created_at);
    return age < COOLDOWN_MS;
}

async function hasOpenRequest(db, requesterId, targetRoleId) {
    const row = await dbGet(
        db,
        `SELECT id FROM staff_role_requests
         WHERE requester_id = ? AND target_role_id = ? AND status = ?
         LIMIT 1`,
        [requesterId, targetRoleId, STATUS.OPEN],
    );
    return !!row;
}

function isApprover(member) {
    return !!(member && member.roles && member.roles.cache && member.roles.cache.has(APPROVER_ROLE_ID));
}

// ── Slash command handler ──────────────────────────────────────────────────

async function handleRequestStaffRoleCommand(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({
            content: "Команда доступна только на сервере.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
        return interaction.reply({
            content: "Не удалось получить ваши данные участника.",
            flags: MessageFlags.Ephemeral,
        });
    }
    for (const r of REQUESTABLE_ROLES) {
        if (member.roles.cache.has(r.id)) {
            return interaction.reply({
                content: `У вас уже есть роль **${r.long}**. Заявка не нужна.`,
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    const hub =
        ctx.client.channels.cache.find((c) => c.guild?.id === guild.id && c.name === HUB_CHANNEL_NAME) ||
        (await ensureRequestHubChannel(ctx.client, guild.id).catch(() => null));
    if (!hub) {
        return interaction.reply({
            content: "Не удалось найти или создать канал для заявок. Обратитесь к администратору.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const roleId = interaction.options.getString("role", true);
    if (!REQUESTABLE_ROLE_IDS.has(roleId)) {
        return interaction.reply({
            content: "Не удалось определить выбранную роль.",
            flags: MessageFlags.Ephemeral,
        });
    }
    // Server is implied by the role (each role in REQUESTABLE_ROLES has a
    // .server field of either "legacy" or "home").
    const targetRole = roleById(roleId);
    const serverLabel = targetRole?.server === "home" ? "home" : "legacy";

    return interaction.showModal(buildRequestModal(roleId, serverLabel));
}

// ── Request modal submit handler ───────────────────────────────────────────

async function handleRequestModalSubmit(interaction, ctx) {
    if (!interaction.customId || !interaction.customId.startsWith(MODAL_REQUEST_CUSTOM_ID + ":")) return false;
    if (!interaction.guild) {
        await interaction.reply({ content: "Доступно только на сервере.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    // customId format: "srr:request-modal:<roleId>:<server>"
    const parts = interaction.customId.split(":");
    const roleValue = parts[2] || null;
    const serverValue = parts[3] === "home" ? "home" : "legacy";

    const nick = interaction.fields.getTextInputValue("srr_nick").trim();
    const forumUrl = interaction.fields.getTextInputValue("srr_forum_url").trim();
    let socialRaw = "";
    try { socialRaw = interaction.fields.getTextInputValue("srr_social"); } catch (_) {}
    const social = (socialRaw || "").trim();

    if (!roleValue || !REQUESTABLE_ROLE_IDS.has(roleValue)) {
        await interaction.reply({ content: "Не удалось определить выбранную роль.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    // Validate the forum URL: must start with http:// or https://
    if (!/^https?:\/\/.+/i.test(forumUrl)) {
        await interaction.reply({
            content: "Ссылка на форумник должна начинаться с http:// или https://",
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return true;
    }
    // Validate the social URL: must be a VK or Telegram link
    if (!/^https?:\/\/(vk\.com\/|vk\.ru\/|t\.me\/|telegram\.me\/)/i.test(social)) {
        await interaction.reply({
            content: "В последнем поле нужна ссылка на VK (vk.com/vk.ru) или Telegram (t.me/telegram.me).",
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return true;
    }
    if (!serverValue || !["legacy", "home"].includes(serverValue)) {
        await interaction.reply({ content: "Не удалось определить выбранный сервер.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
        await interaction.reply({ content: "Не удалось получить данные участника.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    if (member.roles.cache.has(roleValue)) {
        const r = roleById(roleValue);
        await interaction.reply({
            content: `У вас уже есть роль **${r.long}**.`,
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return true;
    }

    if (await isOnCooldown(ctx.db, interaction.user.id, roleValue)) {
        await interaction.reply({
            content: `Недавно вам уже отклоняли заявку на эту роль. Попробуйте снова через 5 минут.`,
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return true;
    }

    if (await hasOpenRequest(ctx.db, interaction.user.id, roleValue)) {
        await interaction.reply({
            content: "У вас уже есть открытая заявка на эту роль. Дождитесь её закрытия.",
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return true;
    }

    const hub =
        interaction.guild.channels.cache.find((c) => c.name === HUB_CHANNEL_NAME) ||
        (await ensureRequestHubChannel(ctx.client, interaction.guild.id).catch(() => null));
    if (!hub) {
        await interaction.reply({
            content: "Не удалось найти канал для заявок.",
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return true;
    }

    const id = genId();
    const now = Date.now();
    const row = {
        id,
        guild_id: interaction.guild.id,
        thread_id: null,
        requester_id: interaction.user.id,
        target_role_id: roleValue,
        server_label: serverValue,
        nick,
        forum_url: forumUrl,
        social_url: social,
        status: STATUS.OPEN,
        approver_id: null,
        rejection_reason: null,
        rejection_advice: null,
        rejection_edited_at: null,
        resolved_at: null,
        created_at: now,
    };

    await interaction.reply({
        content: "✅ Заявка принята, создаю тред…",
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    try {
        const thread = await hub.threads.create({
            name: `заявка-${member.user.username}-${roleById(roleValue).short}`.slice(0, 100),
            type: ChannelType.PrivateThread,
            invitable: false,
            reason: `Staff role request by ${interaction.user.tag}`,
        });
        row.thread_id = thread.id;
        await dbRun(
            ctx.db,
            `INSERT INTO staff_role_requests
                (id, guild_id, thread_id, requester_id, target_role_id, server_label,
                 nick, forum_url, social_url, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                row.id, row.guild_id, row.thread_id, row.requester_id, row.target_role_id,
                row.server_label, row.nick, row.forum_url, row.social_url,
                row.status, row.created_at,
            ],
        );

        const embed = buildRequestEmbed(row);
        const actions = buildRequestActionRow(row.id);
        const mention = `<@&${APPROVER_ROLE_ID}>`;
        const requesterMention = `<@${interaction.user.id}>`;
        await thread.send({
            content: `${mention} — новая заявка. Нажмите ✅ чтобы одобрить, ❌ чтобы отклонить (потребуется причина).

${requesterMention} — если у модераторов возникнут вопросы, напишите в этом треде.`,
            embeds: [embed],
            components: [actions],
        });

        await interaction.editReply({
            content: `✅ Заявка создана: ${thread.toString()}`,
        }).catch(() => {});
    } catch (err) {
        console.error("[staff-role-requests] thread create failed", err);
        await interaction.editReply({
            content: "Не удалось создать тред для заявки. Попробуйте позже.",
        }).catch(() => {});
    }
    return true;
}

// ── Rejection modal submit handler ─────────────────────────────────────────

async function handleRejectionModalSubmit(interaction, ctx) {
    if (!interaction.customId || !interaction.customId.startsWith(MODAL_REJECT_CUSTOM_ID + ":")) return false;
    if (!interaction.isModalSubmit()) return false;

    const requestId = interaction.customId.slice(MODAL_REJECT_CUSTOM_ID.length + 1);
    const row = await dbGet(ctx.db, `SELECT * FROM staff_role_requests WHERE id = ?`, [requestId]);
    if (!row) {
        await interaction.reply({ content: "Заявка не найдена.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    if (row.status !== STATUS.OPEN) {
        await interaction.reply({ content: "Эта заявка уже обработана.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!isApprover(member)) {
        await interaction.reply({ content: "У вас нет прав отклонять заявки.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    let reason = "";
    let advice = "";
    try { reason = (interaction.fields.getTextInputValue("srr_rej_reason") || "").trim(); } catch (_) {}
    try { advice = (interaction.fields.getTextInputValue("srr_rej_advice") || "").trim(); } catch (_) {}
    if (reason.length < 10) {
        await interaction.reply({ content: "Причина должна содержать не менее 10 символов.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    await dbRun(
        ctx.db,
        `UPDATE staff_role_requests
            SET status = ?, approver_id = ?, rejection_reason = ?, rejection_advice = ?,
                rejection_edited_at = NULL, resolved_at = ?
          WHERE id = ? AND status = ?`,
        [STATUS.REJECTED, interaction.user.id, reason, advice, Date.now(), requestId, STATUS.OPEN],
    );

    // Re-render the request message in the thread
    try {
        const thread = await interaction.guild.channels.fetch(row.thread_id).catch(() => null);
        if (thread && thread.isThread()) {
            const newRow = { ...row, status: STATUS.REJECTED, approver_id: interaction.user.id,
                             rejection_reason: reason, rejection_advice: advice, resolved_at: Date.now() };
            const embed = buildRequestEmbed(newRow, {
                state: STATUS.REJECTED,
                approverTag: interaction.user.tag,
                rejectionReason: reason,
                rejectionAdvice: advice,
            });
            const messages = await thread.messages.fetch({ limit: 10 }).catch(() => null);
            const requestMsg = messages?.find((m) =>
                m.author?.id === ctx.client.user.id &&
                m.embeds?.[0]?.footer?.text === `ID заявки: ${row.id}`,
            );
            if (requestMsg) {
                const editRow = buildRejecterEditRow(row.id);
                await requestMsg.edit({
                    content: `Заявка обработана.`,
                    embeds: [embed],
                    components: [editRow],
                });
            }
            await thread.setName(`❌-${thread.name}`.slice(0, 100)).catch(() => {});
            await thread.setLocked(true).catch(() => {});
        }
    } catch (err) {
        console.error("[staff-role-requests] reject post-process failed", err);
    }

    await postModLog(ctx.client, {
        title: "❌ Заявка отклонена",
        fields: [
            { name: "Заявитель", value: `<@${row.requester_id}>`, inline: true },
            { name: "Роль", value: roleById(row.target_role_id)?.long || row.target_role_id, inline: true },
            { name: "Модератор", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Причина", value: reason.slice(0, 1024) },
            ...(advice ? [{ name: "Совет", value: advice.slice(0, 1024) }] : []),
            { name: "Тред", value: `<#${row.thread_id}>`, inline: false },
        ],
        color: 0xe74c3c,
    });

    try {
        const target = roleById(row.target_role_id);
        const user = await ctx.client.users.fetch(row.requester_id).catch(() => null);
        if (user) {
            const dm = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle("❌ Ваша заявка отклонена")
                .setDescription(
                    `Заявка на **${target?.long || row.target_role_id}** была отклонена модератором <@${interaction.user.id}>.` +
                    `\n\n**Причина:** ${reason}` +
                    (advice ? `\n**Совет:** ${advice}` : "") +
                    `\n\nПовторная заявка на эту же роль возможна через 5 минут.`,
                )
                .setTimestamp();
            await user.send({ embeds: [dm] }).catch(() => {});
        }
    } catch (err) {
        console.error("[staff-role-requests] DM failed", err);
    }

    await interaction.reply({
        content: "Заявка отклонена. Тред закрыт, заявитель уведомлён.",
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    return true;
}

// ── Button click handler ───────────────────────────────────────────────────

async function handleRequestButton(interaction, ctx) {
    if (!interaction.customId || !interaction.customId.startsWith(PREFIX)) return false;
    if (!interaction.isButton()) return false;

    const customId = interaction.customId;
    if (customId.startsWith(BTN_APPROVE + ":") ||
        customId.startsWith(BTN_REJECT + ":") ||
        customId.startsWith(BTN_EDIT_REASON + ":") ||
        customId.startsWith(BTN_REASSIGN + ":")) {
        const sepIdx = customId.indexOf(":");
        const head = customId.slice(0, sepIdx);
        const id = customId.slice(sepIdx + 1);
        const row = await dbGet(ctx.db, `SELECT * FROM staff_role_requests WHERE id = ?`, [id]);
        if (!row) {
            await interaction.reply({ content: "Заявка не найдена.", flags: MessageFlags.Ephemeral }).catch(() => {});
            return true;
        }
        if (row.requester_id === interaction.user.id) {
            await interaction.reply({
                content: "Вы не можете голосовать по своей заявке.",
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
            return true;
        }
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

        if (head === BTN_APPROVE) {
            return await handleApproveClick(interaction, ctx, row, member);
        }
        if (head === BTN_REJECT) {
            return await handleRejectButtonClick(interaction, ctx, row, member);
        }
        if (head === BTN_EDIT_REASON) {
            return await handleEditReasonButtonClick(interaction, ctx, row, member);
        }
        if (head === BTN_REASSIGN) {
            return await handleReassignButtonClick(interaction, ctx, row, member);
        }
    }
    return false;
}

async function handleApproveClick(interaction, ctx, row, member) {
    if (row.status !== STATUS.OPEN) {
        await interaction.reply({ content: "Эта заявка уже обработана.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    if (!isApprover(member)) {
        await interaction.reply({ content: "У вас нет прав одобрять заявки.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    // Atomic update: only succeeds if still 'open'
    const result = await dbRun(
        ctx.db,
        `UPDATE staff_role_requests
            SET status = ?, approver_id = ?, resolved_at = ?
          WHERE id = ? AND status = ?`,
        [STATUS.APPROVED, interaction.user.id, Date.now(), row.id, STATUS.OPEN],
    );
    if (!result || result.changes === 0) {
        await interaction.reply({ content: "Заявка уже обработана другим модератором.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    // Grant the role
    const guild = interaction.guild;
    const targetMember = await guild.members.fetch(row.requester_id).catch(() => null);
    const target = roleById(row.target_role_id);
    if (targetMember && target) {
        try {
            await targetMember.roles.add(target.id, `Approved by ${interaction.user.tag} (request ${row.id})`);
        } catch (err) {
            console.error("[staff-role-requests] role grant failed", err);
            await interaction.reply({
                content: "Не удалось выдать роль — проверьте иерархию. Заявка помечена как одобренная, но роль не выдана.",
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }
    }

    // Update thread message
    try {
        const thread = await guild.channels.fetch(row.thread_id).catch(() => null);
        if (thread && thread.isThread()) {
            const newRow = { ...row, status: STATUS.APPROVED, approver_id: interaction.user.id, resolved_at: Date.now() };
            const embed = buildRequestEmbed(newRow, {
                state: STATUS.APPROVED,
                approverTag: interaction.user.tag,
            });
            const messages = await thread.messages.fetch({ limit: 10 }).catch(() => null);
            const requestMsg = messages?.find((m) =>
                m.author?.id === ctx.client.user.id &&
                m.embeds?.[0]?.footer?.text === `ID заявки: ${row.id}`,
            );
            if (requestMsg) {
                await requestMsg.edit({
                    content: `Заявка одобрена модератором <@${interaction.user.id}>.`,
                    embeds: [embed],
                    components: [],
                });
            }
            await thread.setName(`✅-${thread.name}`.slice(0, 100)).catch(() => {});
            await thread.setLocked(true).catch(() => {});
        }
    } catch (err) {
        console.error("[staff-role-requests] approve post-process failed", err);
    }

    await postModLog(ctx.client, {
        title: "✅ Заявка одобрена",
        fields: [
            { name: "Заявитель", value: `<@${row.requester_id}>`, inline: true },
            { name: "Роль", value: target?.long || row.target_role_id, inline: true },
            { name: "Модератор", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Тред", value: `<#${row.thread_id}>`, inline: false },
        ],
        color: 0x2ecc71,
    });

    try {
        const user = await ctx.client.users.fetch(row.requester_id).catch(() => null);
        if (user) {
            const dm = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle("✅ Вам выдана staff-роль")
                .setDescription(
                    `Поздравляем! Заявка на **${target?.long || row.target_role_id}** одобрена модератором <@${interaction.user.id}>. Роль уже у вас.`,
                )
                .setTimestamp();
            await user.send({ embeds: [dm] }).catch(() => {});
        }
    } catch (err) {
        console.error("[staff-role-requests] DM failed", err);
    }

    await interaction.reply({ content: "Заявка одобрена, роль выдана.", flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

async function handleRejectButtonClick(interaction, ctx, row, member) {
    if (row.status !== STATUS.OPEN) {
        await interaction.reply({ content: "Эта заявка уже обработана.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    if (!isApprover(member)) {
        await interaction.reply({ content: "У вас нет прав отклонять заявки.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    await interaction.showModal(buildRejectionModal(row.id));
    return true;
}

async function handleEditReasonButtonClick(interaction, ctx, row, member) {
    if (row.status !== STATUS.REJECTED) {
        await interaction.reply({ content: "Эта заявка не отклонена.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    if (!isApprover(member)) {
        await interaction.reply({ content: "У вас нет прав редактировать причину.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    if (row.approver_id !== interaction.user.id) {
        await interaction.reply({
            content: "Только модератор, отклонивший заявку, может редактировать причину.",
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return true;
    }
    const age = Date.now() - (row.rejection_edited_at || row.resolved_at || 0);
    if (age > EDIT_WINDOW_MS) {
        await interaction.reply({ content: "24-часовой период редактирования истёк.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const modal = buildEditReasonModal(row.id);
    const reasonInput = modal.components[0].components[0];
    const adviceInput = modal.components[1].components[0];
    reasonInput.setValue(row.rejection_reason || "");
    adviceInput.setValue(row.rejection_advice || "");

    await interaction.showModal(modal);
    return true;
}

async function handleReassignButtonClick(interaction, ctx, row, member) {
    if (row.requester_id !== interaction.user.id) {
        await interaction.reply({ content: "Только заявитель может переоформить.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    if (row.status !== STATUS.OPEN) {
        await interaction.reply({ content: "Эта заявка уже обработана.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    await dbRun(
        ctx.db,
        `UPDATE staff_role_requests SET status = ?, resolved_at = ? WHERE id = ? AND status = ?`,
        [STATUS.CANCELLED, Date.now(), row.id, STATUS.OPEN],
    );
    // Modals can no longer collect role+server (Discord disallows in-modal
    // selects), so we point the user at the slash command instead.
    await interaction.reply({
        content: "Старая заявка отменена. Запустите `/request-staff-role` ещё раз, чтобы подать новую.",
        flags: MessageFlags.Ephemeral,
    });
    return true;
}

// ── Edit reason modal submit ───────────────────────────────────────────────

async function handleEditReasonModalSubmit(interaction, ctx) {
    if (!interaction.customId || !interaction.customId.startsWith(EDIT_REASON_MODAL_CUSTOM_ID + ":")) return false;
    const requestId = interaction.customId.slice(EDIT_REASON_MODAL_CUSTOM_ID.length + 1);
    const row = await dbGet(ctx.db, `SELECT * FROM staff_role_requests WHERE id = ?`, [requestId]);
    if (!row) {
        await interaction.reply({ content: "Заявка не найдена.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    if (row.status !== STATUS.REJECTED) {
        await interaction.reply({ content: "Эта заявка не отклонена.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!isApprover(member) || row.approver_id !== interaction.user.id) {
        await interaction.reply({ content: "Только автор отказа может его редактировать.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    const age = Date.now() - (row.rejection_edited_at || row.resolved_at || 0);
    if (age > EDIT_WINDOW_MS) {
        await interaction.reply({ content: "24-часовой период редактирования истёк.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    let reason = "";
    let advice = "";
    try { reason = (interaction.fields.getTextInputValue("srr_rej_reason") || "").trim(); } catch (_) {}
    try { advice = (interaction.fields.getTextInputValue("srr_rej_advice") || "").trim(); } catch (_) {}
    if (reason.length < 10) {
        await interaction.reply({ content: "Причина должна содержать не менее 10 символов.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    await dbRun(
        ctx.db,
        `UPDATE staff_role_requests
            SET rejection_reason = ?, rejection_advice = ?, rejection_edited_at = ?
          WHERE id = ?`,
        [reason, advice, Date.now(), requestId],
    );

    try {
        const thread = await interaction.guild.channels.fetch(row.thread_id).catch(() => null);
        if (thread && thread.isThread()) {
            const newRow = { ...row, rejection_reason: reason, rejection_advice: advice };
            const embed = buildRequestEmbed(newRow, {
                state: STATUS.REJECTED,
                approverTag: interaction.user?.tag,
                rejectionReason: reason,
                rejectionAdvice: advice,
            });
            const messages = await thread.messages.fetch({ limit: 10 }).catch(() => null);
            const requestMsg = messages?.find((m) =>
                m.author?.id === ctx.client.user.id &&
                m.embeds?.[0]?.footer?.text === `ID заявки: ${row.id}`,
            );
            if (requestMsg) {
                const editRow = buildRejecterEditRow(row.id);
                await requestMsg.edit({
                    content: `Заявка отклонена модератором <@${interaction.user.id}>.`,
                    embeds: [embed],
                    components: [editRow],
                });
            }
        }
    } catch (err) {
        console.error("[staff-role-requests] edit-reason post-process failed", err);
    }

    await postModLog(ctx.client, {
        title: "✏️ Причина отказа отредактирована",
        fields: [
            { name: "Заявка", value: `<#${row.thread_id}>`, inline: false },
            { name: "Роль", value: roleById(row.target_role_id)?.long || row.target_role_id, inline: true },
            { name: "Модератор", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Новая причина", value: reason.slice(0, 1024) },
            ...(advice ? [{ name: "Новый совет", value: advice.slice(0, 1024) }] : []),
        ],
        color: 0xf39c12,
    });

    try {
        const target = roleById(row.target_role_id);
        const user = await ctx.client.users.fetch(row.requester_id).catch(() => null);
        if (user) {
            const dm = new EmbedBuilder()
                .setColor(0xf39c12)
                .setTitle("✏️ Причина отказа обновлена")
                .setDescription(
                    `Модератор <@${interaction.user.id}> обновил причину отказа по заявке на **${target?.long || row.target_role_id}**.\n\n**Новая причина:** ${reason}` +
                    (advice ? `\n**Совет:** ${advice}` : ""),
                )
                .setTimestamp();
            await user.send({ embeds: [dm] }).catch(() => {});
        }
    } catch (err) {
        console.error("[staff-role-requests] edit-reason DM failed", err);
    }

    await interaction.reply({ content: "Причина обновлена.", flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
}

// ── Mod-log helper ─────────────────────────────────────────────────────────

async function postModLog(client, { title, fields, color }) {
    try {
        const channel = await client.channels.fetch(MOD_LOG_CHANNEL_ID).catch(() => null);
        if (!channel || !channel.isTextBased()) return;
        const embed = new EmbedBuilder()
            .setColor(color || 0x5865f2)
            .setTitle(title)
            .addFields(fields)
            .setTimestamp();
        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error("[staff-role-requests] mod-log post failed", err);
    }
}

// ── Thread message handler (screenshot tracking) ──────────────────────────
//
// When a message lands in a private request thread:
//   1. If it's from the original requester AND has an image attachment,
//      we mark the request's screenshot_status as "posted" and edit the
//      original request embed to reflect it.
//   2. We do not moderate arbitrary text in the thread — anyone with
//      thread access can comment.
//
// The check is intentionally cheap: fetch the request row by thread_id,
// if it exists, the message is in a valid request thread, and we
// recognize the author + has-attach pattern, mark it.

async function handleStaffRequestThreadMessage(message, ctx) {
    try {
        if (!message || !message.channel || !message.channel.isThread || !message.channel.isThread()) {
            return false;
        }
        if (message.author?.id === ctx.client.user.id) {
            return false;  // ignore our own messages
        }
        const threadId = message.channel.id;
        const row = await dbGet(
            ctx.db,
            `SELECT * FROM staff_role_requests WHERE thread_id = ? LIMIT 1`,
            [threadId],
        );
        if (!row) return false;

        // Only the original requester can post the screenshot.
        if (message.author.id !== row.requester_id) {
            return false;
        }

        // Has an image attachment?
        const hasImage = (message.attachments || new Map()).some(
            (a) => a.contentType && a.contentType.startsWith("image/"),
        );
        const content = (message.content || "").toLowerCase();
        const mentionsTime = content.includes("/time") || content.includes("time");

        if (!hasImage) {
            return false;
        }

        if (row.screenshot_status === "posted") {
            // Already marked; just acknowledge with a ✅ reaction so the
            // user knows we noticed the additional image.
            try { await message.react("✅"); } catch (_) {}
            return true;
        }

        await dbRun(
            ctx.db,
            `UPDATE staff_role_requests SET screenshot_status = ? WHERE id = ?`,
            ["posted", row.id],
        );

        // Edit the original request embed in the thread to reflect the
        // screenshot is in.
        try {
            const messages = await message.channel.messages.fetch({ limit: 20 });
            const requestMsg = messages.find(
                (m) => m.author?.id === ctx.client.user.id &&
                       m.embeds?.[0]?.footer?.text === `ID заявки: ${row.id}`,
            );
            if (requestMsg) {
                const newRow = { ...row, screenshot_status: "posted" };
                // Re-render the embed (status is "open" for this re-render).
                const embed = buildRequestEmbed(newRow);
                // Preserve the existing action row (Approve/Reject/Reassign)
                // if the request is still open.
                if (row.status === STATUS.OPEN) {
                    const actions = buildRequestActionRow(row.id);
                    await requestMsg.edit({ embeds: [embed], components: [actions] });
                } else {
                    await requestMsg.edit({ embeds: [embed] });
                }
            }
        } catch (err) {
            console.error("[staff-role-requests] embed refresh on screenshot failed", err);
        }

        try { await message.react("✅"); } catch (_) {}
        if (mentionsTime) {
            try { await message.react("🕒"); } catch (_) {}
        }
        return true;
    } catch (err) {
        console.error("[staff-role-requests] thread message handler error", err);
        return false;
    }
}

module.exports = {
    APPROVER_ROLE_ID,
    REQUESTABLE_ROLES,
    HUB_CHANNEL_NAME,
    PREFIX,
    ensureStaffRoleRequestsTable,
    ensureRequestHubChannel,
    getStaffRoleRequestCommandBuilder,
    handleRequestStaffRoleCommand,
    handleRequestModalSubmit,
    handleRejectionModalSubmit,
    handleEditReasonModalSubmit,
    handleRequestButton,
    handleStaffRequestThreadMessage,
};

