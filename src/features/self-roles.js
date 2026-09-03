/**
 * self-roles.js — opt-in ping role toggles
 *
 * Posts a single message in #выдача-ролей with a row of buttons.
 * Each button toggles a specific role for the clicker. Roles are
 * notification-only (perms=0, not managed, not staff, not legacy).
 *
 * customId format: selfrole:<roleId>
 *   -> safe to extend in future; lets handleSelfRoleButton no-op
 *      anything it doesn't recognize.
 */

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
} = require("discord.js");

// Roles users can grant themselves. Source of truth lives here; the
// IDs are real, verified against the live API on 2026-07-08.
// All five are perms=0, unmanaged, non-staff, non-legacy. To add a
// role, append to this array — nothing else needs touching.
const SELF_ROLES = [
    { id: "1434669260642455592", emoji: "\uD83D\uDD14", label: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F",  desc: "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F \u0438 \u043F\u0430\u0442\u0447\u0438" },
    { id: "1434669496345559140", emoji: "\uD83D\uDCE2", label: "\u0410\u043D\u043E\u043D\u0441\u044B",      desc: "\u0432\u0430\u0436\u043D\u044B\u0435 \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u044F" },
    { id: "1434669610652926093", emoji: "\uD83C\uDF81", label: "\u0420\u043E\u0437\u044B\u0433\u0440\u044B\u0448\u0438",   desc: "\u043F\u0440\u0438\u0437\u044B \u0438 \u043A\u043E\u043D\u043A\u0443\u0440\u0441\u044B" },
    { id: "1434669675567910972", emoji: "\uD83C\uDFAE", label: "\u0418\u0432\u0435\u043D\u0442\u044B",      desc: "\u0438\u0433\u0440\u043E\u0432\u044B\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u044F" },
    { id: "1434669731272458362", emoji: "\uD83D\uDCCA", label: "\u041E\u043F\u0440\u043E\u0441\u044B",      desc: "\u0433\u043E\u043B\u043E\u0441\u043E\u0432\u0430\u043D\u0438\u044F \u0441\u043E\u043E\u0431\u0449\u0435\u0441\u0442\u0432\u0430" },
];

const SELF_ROLE_IDS = new Set(SELF_ROLES.map((r) => r.id));
const CUSTOM_ID_PREFIX = "selfrole:";
const MAX_BUTTONS_PER_ROW = 5; // Discord hard cap

function buildSelfRolesEmbed() {
    const lines = SELF_ROLES.map((r) => `${r.emoji}  **${r.label}** \u2014 ${r.desc}`).join("\n");
    return new EmbedBuilder()
        .setColor(0x5865f2) // Discord blurple
        .setTitle("\u2B50 \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F")
        .setDescription(
            "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u043D\u0443\u0436\u043D\u044B\u0435 \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F \u0441\u0435\u0440\u0432\u0435\u0440\u0430. " +
            "\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u043E\u0435 \u043D\u0430\u0436\u0430\u0442\u0438\u0435 \u043E\u0442\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442.\n\n" +
            "\u0412\u0441\u0435 \u0440\u043E\u043B\u0438 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F. \u0414\u043E\u0441\u0442\u0443\u043F \u043A \u0441\u0435\u0440\u0432\u0435\u0440\u0443 \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F.\n\n" +
            lines,
        )
        .setFooter({ text: "\u041A\u043D\u043E\u043F\u043A\u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u2014 \u043F\u0440\u043E\u0441\u0442\u043E \u043A\u043B\u0438\u043A\u043D\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437, \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F" });
}

/**
 * Build the button row. Button style reflects whether the member
 * currently holds that role (Success/green = has, Secondary/grey = doesn't).
 */
function buildSelfRolesRow(member) {
    const buttons = SELF_ROLES.map((role) => {
        const hasIt = member && member.roles && member.roles.cache && member.roles.cache.has(role.id);
        return new ButtonBuilder()
            .setCustomId(`${CUSTOM_ID_PREFIX}${role.id}`)
            .setLabel(role.label)
            .setEmoji(role.emoji)
            .setStyle(hasIt ? ButtonStyle.Success : ButtonStyle.Secondary);
    });
    return new ActionRowBuilder().addComponents(buttons.slice(0, MAX_BUTTONS_PER_ROW));
}

/**
 * Handle a button click whose customId starts with `selfrole:`.
 * Returns true if the interaction was claimed (even on soft errors),
 * false if the prefix didn't match (so the caller can keep routing).
 */
async function handleSelfRoleButton(interaction) {
    const customId = interaction.customId;
    if (!customId || !customId.startsWith(CUSTOM_ID_PREFIX)) return false;

    const roleId = customId.slice(CUSTOM_ID_PREFIX.length);
    if (!SELF_ROLE_IDS.has(roleId)) {
        try {
            await interaction.reply({
                content: "\u042D\u0442\u0430 \u0440\u043E\u043B\u044C \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0434\u043B\u044F \u0441\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u043E\u0439 \u0432\u044B\u0434\u0430\u0447\u0438.",
                flags: MessageFlags.Ephemeral,
            });
        } catch (_) { /* expired */ }
        return true;
    }

    const guild = interaction.guild;
    if (!guild) {
        await interaction.reply({ content: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    let member = interaction.member;
    if (!member || !member.roles) {
        member = await guild.members.fetch(interaction.user.id).catch(() => null);
    }
    if (!member) {
        await interaction.reply({ content: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        await interaction.reply({ content: "\u0420\u043E\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    if (role.managed) {
        await interaction.reply({ content: "\u042D\u0442\u0430 \u0440\u043E\u043B\u044C \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0438\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0435\u0439 \u0438 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0432\u044B\u0434\u0430\u043D\u0430 \u0432\u0440\u0443\u0447\u043D\u0443\u044E.", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }
    const me = guild.members.me;
    if (me && role.position >= me.roles.highest.position) {
        await interaction.reply({ content: "\u0423 \u0431\u043E\u0442\u0430 \u043D\u0435\u0442 \u043F\u0440\u0430\u0432 \u0432\u044B\u0434\u0430\u0442\u044C \u044D\u0442\u0443 \u0440\u043E\u043B\u044C (\u0438\u0435\u0440\u0430\u0440\u0445\u0438\u044F).", flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
    }

    const has = member.roles.cache.has(roleId);
    const def = SELF_ROLES.find((r) => r.id === roleId);
    try {
        if (has) {
            await member.roles.remove(roleId, `Self-role toggle by ${interaction.user.tag}`);
        } else {
            await member.roles.add(roleId, `Self-role toggle by ${interaction.user.tag}`);
        }
    } catch (err) {
        console.error("[self-roles] toggle failed", err);
        await interaction.reply({
            content: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0440\u043E\u043B\u044C. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439 \u0435\u0449\u0451 \u0440\u0430\u0437 \u043F\u043E\u0437\u0436\u0435.",
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return true;
    }

    await interaction.reply({
        content: has
            ? `${def.emoji} \u0420\u043E\u043B\u044C **${def.label}** \u0441\u043D\u044F\u0442\u0430.`
            : `${def.emoji} \u0420\u043E\u043B\u044C **${def.label}** \u0432\u044B\u0434\u0430\u043D\u0430.`,
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});

    // Refresh the message so the button colour reflects the new state.
    try {
        const fresh = await guild.members.fetch(interaction.user.id).catch(() => member);
        const newRow = buildSelfRolesRow(fresh);
        await interaction.message.edit({ components: [newRow] }).catch(() => {});
    } catch (err) {
        console.error("[self-roles] message edit failed", err);
    }

    return true;
}

/**
 * One-shot poster: drops a fresh self-roles message in the channel.
 * Safe to run repeatedly; each call posts a new message above existing.
 */
async function postSelfRolesMessage(client, channelId) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        return { ok: false, error: "Channel not found or not text-based" };
    }
    // Initial row is "neutral" (all grey). It self-updates the first time
    // anyone clicks — and the embed text makes the green/grey mapping clear.
    const dummyMember = { roles: { cache: { has: () => false } } };
    const row = buildSelfRolesRow(dummyMember);
    const embed = buildSelfRolesEmbed();
    const message = await channel.send({ embeds: [embed], components: [row] });
    return { ok: true, messageId: message.id, channelId };
}

module.exports = {
    SELF_ROLES,
    buildSelfRolesEmbed,
    buildSelfRolesRow,
    handleSelfRoleButton,
    postSelfRolesMessage,
};
