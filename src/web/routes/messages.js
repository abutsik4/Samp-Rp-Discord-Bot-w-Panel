const { Router } = require("express");
const { EmbedBuilder, PermissionsBitField } = require("discord.js");

function createMessagesRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, requireAdmin, apiLimiter, bots,
    isAllowedChannel, validateLength, parseHexColor,
    getAllSendableChannels, dbRun, dbGet, dbAll,
    panelHttpLogger,
  } = ctx;

  // -------------------------
  // PANEL API
  // -------------------------
  router.get(`${PANEL_BASE}/api/:botKey/sendable-channels`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const items = await getAllSendableChannels(bot.client, isAllowedChannel);
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  // Messages API - GET all messages
  router.get(`${PANEL_BASE}/api/:botKey/messages`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const messages = await dbAll(
        `SELECT * FROM panel_messages WHERE bot_key = ? ORDER BY created_at DESC`,
        [bot.key]
      );
      return res.json({ ok: true, messages });
    } catch (e) {
      return res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Messages API - POST create/send message
  router.post(`${PANEL_BASE}/api/:botKey/messages`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { channelId, content, embed, status } = req.body;

    try {
      let messageId = null;
      let discordMessageId = null;

      // Validate lengths early to return 400 instead of Discord validation error
      const contentCheck = validateLength(content, 2000, "Content");
      if (!contentCheck.ok) return res.status(400).json({ error: contentCheck.error });
      const titleCheck = validateLength(embed?.title, 256, "Embed title");
      if (!titleCheck.ok) return res.status(400).json({ error: titleCheck.error });
      const descCheck = validateLength(embed?.description, 4096, "Embed description");
      if (!descCheck.ok) return res.status(400).json({ error: descCheck.error });
      const footerCheck = validateLength(embed?.footer, 2048, "Embed footer");
      if (!footerCheck.ok) return res.status(400).json({ error: footerCheck.error });

      // Normalize embed for storage/use after validation
      let normalizedEmbed = null;
      if (embed && (embed.title || embed.description || embed.footer || embed.imageData)) {
        normalizedEmbed = {
          title: titleCheck.value || undefined,
          description: descCheck.value || undefined,
          color: embed.color || undefined,
          footer: footerCheck.value || undefined,
          imageData: embed.imageData || undefined,
        };
      }

      // Send to Discord if status is 'sent'
      if (status === 'sent' && channelId) {
        if (!isAllowedChannel(String(channelId))) {
          return res.status(403).json({ error: "Channel is not allow-listed for panel posting" });
        }
        const channel = await bot.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          return res.status(400).json({ error: "Invalid channel" });
        }

        const perms = channel.permissionsFor(bot.client.user?.id || bot.client.application?.id);
        const canSend = perms?.has(channel.isThread() ? PermissionsBitField.Flags.SendMessagesInThreads : PermissionsBitField.Flags.SendMessages);
        const canView = perms?.has(PermissionsBitField.Flags.ViewChannel);
        if (!canView || !canSend) {
          return res.status(403).json({ error: "Bot lacks permission to send to this channel" });
        }

        const payload = {};
        if (contentCheck.value) payload.content = contentCheck.value;
        
        if (normalizedEmbed && (normalizedEmbed.title || normalizedEmbed.description)) {
          const embedBuilder = new EmbedBuilder();
          if (normalizedEmbed.title) embedBuilder.setTitle(normalizedEmbed.title);
          if (normalizedEmbed.description) embedBuilder.setDescription(normalizedEmbed.description);
          embedBuilder.setColor(parseHexColor(normalizedEmbed.color, 0x00aeff));
          if (normalizedEmbed.footer?.trim()) embedBuilder.setFooter({ text: normalizedEmbed.footer.trim() });
          if (normalizedEmbed.imageData && normalizedEmbed.imageData.startsWith('data:image')) {
            // For now, we'll skip image upload - could use Discord CDN or attachments later
            // embedBuilder.setImage(embed.imageData);
          }
          embedBuilder.setTimestamp();
          payload.embeds = [embedBuilder];
        }

        const sentMessage = await channel.send(payload);
        discordMessageId = sentMessage.id;
      }

      // Save to database
      const result = await dbRun(
        `INSERT INTO panel_messages (bot_key, channel_id, content, embed, status, discord_message_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [bot.key, channelId || null, contentCheck.value || null, normalizedEmbed ? JSON.stringify(normalizedEmbed) : null, status || 'draft', discordMessageId]
      );

      messageId = result.lastID;

      return res.json({ ok: true, id: messageId, discordMessageId });
    } catch (e) {
      console.error('POST /messages error:', e);
      return res.status(500).json({ error: e.message || "Failed to create message" });
    }
  });

  // Messages API - PUT update message
  router.put(`${PANEL_BASE}/api/:botKey/messages/:id`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { id } = req.params;
    const { channelId, content, embed, status } = req.body;

    try {
      // Get existing message
      const existing = await dbGet(`SELECT * FROM panel_messages WHERE id = ? AND bot_key = ?`, [id, bot.key]);
      if (!existing) return res.status(404).json({ error: "Message not found" });

      let discordMessageId = existing.discord_message_id;

      // Validate lengths early to return 400 instead of Discord validation error
      const contentCheck = validateLength(content, 2000, "Content");
      if (!contentCheck.ok) return res.status(400).json({ error: contentCheck.error });
      const titleCheck = validateLength(embed?.title, 256, "Embed title");
      if (!titleCheck.ok) return res.status(400).json({ error: titleCheck.error });
      const descCheck = validateLength(embed?.description, 4096, "Embed description");
      if (!descCheck.ok) return res.status(400).json({ error: descCheck.error });
      const footerCheck = validateLength(embed?.footer, 2048, "Embed footer");
      if (!footerCheck.ok) return res.status(400).json({ error: footerCheck.error });

      // Normalize embed for storage/use after validation
      let normalizedEmbed = null;
      if (embed && (embed.title || embed.description || embed.footer || embed.imageData)) {
        normalizedEmbed = {
          title: titleCheck.value || undefined,
          description: descCheck.value || undefined,
          color: embed.color || undefined,
          footer: footerCheck.value || undefined,
          imageData: embed.imageData || undefined,
        };
      }

      // If sending to Discord
      if (status === 'sent' && channelId) {
        if (!isAllowedChannel(String(channelId))) {
          return res.status(403).json({ error: "Channel is not allow-listed for panel posting" });
        }
        const channel = await bot.client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          return res.status(400).json({ error: "Invalid channel" });
        }

        const perms = channel.permissionsFor(bot.client.user?.id || bot.client.application?.id);
        const canSend = perms?.has(channel.isThread() ? PermissionsBitField.Flags.SendMessagesInThreads : PermissionsBitField.Flags.SendMessages);
        const canView = perms?.has(PermissionsBitField.Flags.ViewChannel);
        if (!canView || !canSend) {
          return res.status(403).json({ error: "Bot lacks permission to send to this channel" });
        }

        const payload = {};
        if (contentCheck.value) payload.content = contentCheck.value;
        
        if (normalizedEmbed && (normalizedEmbed.title || normalizedEmbed.description)) {
          const embedBuilder = new EmbedBuilder();
          if (normalizedEmbed.title) embedBuilder.setTitle(normalizedEmbed.title);
          if (normalizedEmbed.description) embedBuilder.setDescription(normalizedEmbed.description);
          embedBuilder.setColor(parseHexColor(normalizedEmbed.color, 0xe74c3c));
          if (normalizedEmbed.footer?.trim()) embedBuilder.setFooter({ text: normalizedEmbed.footer.trim() });
          embedBuilder.setTimestamp();
          payload.embeds = [embedBuilder];
        }

        // Try to edit existing Discord message, or send new if not possible
        if (discordMessageId && channelId === existing.channel_id) {
          try {
            const existingMessage = await channel.messages.fetch(discordMessageId);
            await existingMessage.edit(payload);
          } catch {
            // If edit fails, send new message
            const sentMessage = await channel.send(payload);
            discordMessageId = sentMessage.id;
          }
        } else {
          // Send to new channel
          const sentMessage = await channel.send(payload);
          discordMessageId = sentMessage.id;
        }
      }

      // Update database
      await dbRun(
        `UPDATE panel_messages 
         SET channel_id = ?, content = ?, embed = ?, status = ?, discord_message_id = ?, updated_at = datetime('now')
         WHERE id = ? AND bot_key = ?`,
        [channelId || null, contentCheck.value || null, normalizedEmbed ? JSON.stringify(normalizedEmbed) : null, status || 'draft', discordMessageId, id, bot.key]
      );

      return res.json({ ok: true, discordMessageId });
    } catch (e) {
      console.error('PUT /messages error:', e);
      return res.status(500).json({ error: e.message || "Failed to update message" });
    }
  });

  // Messages API - DELETE message
  router.delete(`${PANEL_BASE}/api/:botKey/messages/:id`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { id } = req.params;

    try {
      // Get message details
      const message = await dbGet(`SELECT * FROM panel_messages WHERE id = ? AND bot_key = ?`, [id, bot.key]);
      if (!message) return res.status(404).json({ error: "Message not found" });

      // Optionally delete from Discord (currently just marking as deleted in DB)
      // If you want to delete from Discord too:
      // if (message.discord_message_id && message.channel_id) {
      //   try {
      //     const channel = await bot.client.channels.fetch(message.channel_id);
      //     const discordMsg = await channel.messages.fetch(message.discord_message_id);
      //     await discordMsg.delete();
      //   } catch { /* ignore if message already deleted */ }
      // }

      // Delete from database
      await dbRun(`DELETE FROM panel_messages WHERE id = ? AND bot_key = ?`, [id, bot.key]);

      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /messages error:', e);
      return res.status(500).json({ error: e.message || "Failed to delete message" });
    }
  });

  // Direct Discord message edit (by channelId + messageId)
  // Useful for editing older bot-sent embeds/messages that are not in panel_messages.
  router.get(`${PANEL_BASE}/api/:botKey/discord-message`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const channelId = String(req.query.channelId || '').trim();
    const messageId = String(req.query.messageId || '').trim();
    if (!channelId || !messageId) return res.status(400).json({ error: "channelId and messageId are required" });

    try {
      if (!isAllowedChannel(String(channelId))) {
        return res.status(403).json({ error: "Channel is not allow-listed for panel posting" });
      }
      const channel = await bot.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return res.status(400).json({ error: "Invalid channel" });

      const perms = channel.permissionsFor(bot.client.user?.id || bot.client.application?.id);
      const canView = perms?.has(PermissionsBitField.Flags.ViewChannel);
      if (!canView) return res.status(403).json({ error: "Bot lacks permission to view this channel" });

      const msg = await channel.messages.fetch(messageId);
      if (!msg) return res.status(404).json({ error: "Message not found" });

      // Only allow editing bot's own messages
      if (msg.author?.id !== bot.client.user?.id) {
        return res.status(403).json({ error: "Can only load/edit messages sent by this bot" });
      }

      const firstEmbed = Array.isArray(msg.embeds) && msg.embeds.length ? msg.embeds[0] : null;
      const embed = firstEmbed
        ? {
            title: firstEmbed.title || '',
            description: firstEmbed.description || '',
            footer: firstEmbed.footer?.text || '',
            color: (typeof firstEmbed.color === 'number')
              ? ('#' + firstEmbed.color.toString(16).padStart(6, '0'))
              : '',
          }
        : null;

      return res.json({ ok: true, message: { id: msg.id, channelId, content: msg.content || '', embed } });
    } catch (e) {
      console.error('GET /discord-message error:', e);
      return res.status(500).json({ error: "Failed to load message" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/discord-message/edit`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { channelId, messageId, content, embed } = req.body || {};
    const chId = String(channelId || '').trim();
    const msgId = String(messageId || '').trim();
    if (!chId || !msgId) return res.status(400).json({ error: "channelId and messageId are required" });

    try {
      // Validate lengths early
      const contentCheck = validateLength(content, 2000, "Content");
      if (!contentCheck.ok) return res.status(400).json({ error: contentCheck.error });
      const titleCheck = validateLength(embed?.title, 256, "Embed title");
      if (!titleCheck.ok) return res.status(400).json({ error: titleCheck.error });
      const descCheck = validateLength(embed?.description, 4096, "Embed description");
      if (!descCheck.ok) return res.status(400).json({ error: descCheck.error });
      const footerCheck = validateLength(embed?.footer, 2048, "Embed footer");
      if (!footerCheck.ok) return res.status(400).json({ error: footerCheck.error });

      if (!isAllowedChannel(String(chId))) {
        return res.status(403).json({ error: "Channel is not allow-listed for panel posting" });
      }
      const channel = await bot.client.channels.fetch(chId);
      if (!channel || !channel.isTextBased()) return res.status(400).json({ error: "Invalid channel" });

      const perms = channel.permissionsFor(bot.client.user?.id || bot.client.application?.id);
      const canView = perms?.has(PermissionsBitField.Flags.ViewChannel);
      const canSend = perms?.has(channel.isThread() ? PermissionsBitField.Flags.SendMessagesInThreads : PermissionsBitField.Flags.SendMessages);
      if (!canView || !canSend) return res.status(403).json({ error: "Bot lacks permission to edit in this channel" });

      const msg = await channel.messages.fetch(msgId);
      if (!msg) return res.status(404).json({ error: "Message not found" });
      if (msg.author?.id !== bot.client.user?.id) {
        return res.status(403).json({ error: "Can only edit messages sent by this bot" });
      }

      const payload = {};
      if (contentCheck.value) payload.content = contentCheck.value;

      const normalizedEmbed = (embed && (embed.title || embed.description || embed.footer || embed.color))
        ? {
            title: titleCheck.value || undefined,
            description: descCheck.value || undefined,
            color: embed.color || undefined,
            footer: footerCheck.value || undefined,
          }
        : null;

      if (normalizedEmbed && (normalizedEmbed.title || normalizedEmbed.description || normalizedEmbed.footer)) {
        const embedBuilder = new EmbedBuilder();
        if (normalizedEmbed.title) embedBuilder.setTitle(normalizedEmbed.title);
        if (normalizedEmbed.description) embedBuilder.setDescription(normalizedEmbed.description);
        embedBuilder.setColor(parseHexColor(normalizedEmbed.color, 0x00aeff));
        if (normalizedEmbed.footer?.trim()) embedBuilder.setFooter({ text: normalizedEmbed.footer.trim() });
        embedBuilder.setTimestamp();
        payload.embeds = [embedBuilder];
      } else if (embed && embed.clear === true) {
        payload.embeds = [];
      }

      if (!payload.content && !payload.embeds) {
        return res.status(400).json({ error: "Nothing to update (provide content and/or embed)" });
      }

      await msg.edit(payload);
      return res.json({ ok: true, discordMessageId: msg.id });
    } catch (e) {
      console.error('POST /discord-message/edit error:', e);
      return res.status(500).json({ error: e.message || "Failed to edit message" });
    }
  });

  return router;
}

module.exports = { createMessagesRouter };
