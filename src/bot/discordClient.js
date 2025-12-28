const { Client, GatewayIntentBits, Partials } = require("discord.js");

function createDiscordClient() {
    return new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers
        ],
        partials: [Partials.Channel]
    });
}

module.exports = { createDiscordClient };