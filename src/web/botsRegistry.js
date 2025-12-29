function getBotsRegistry({ discordClient }) {
  // Later: you can add vk, vproject, etc as separate entries.
  return {
    samprp: {
      key: "samprp",
      name: "JepsenCloud Bot",
      kind: "discord",
      client: discordClient
    }
  };
}

module.exports = { getBotsRegistry };
