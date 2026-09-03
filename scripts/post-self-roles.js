// posts the self-roles message to the target channel
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { postSelfRolesMessage } = require("../src/features/self-roles");

(async () => {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel],
  });
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("DISCORD_TOKEN env required");
    process.exit(1);
  }
  client.once("ready", async () => {
    try {
      const result = await postSelfRolesMessage(client, "1244781598436622416");
      console.log("post result:", JSON.stringify(result, null, 2));
    } catch (e) {
      console.error("post failed:", e);
      process.exitCode = 2;
    } finally {
      client.destroy();
    }
  });
  await client.login(token);
})();
