function getBotsRegistry({ discordClient }) {
  // Later: you can add vk, vproject, etc as separate entries.
  return {
    samprp: {
      key: "samprp",
      name: "Discord Radio Samp-Rp",
      kind: "discord",
      client: discordClient
    }
  };
}

module.exports = { getBotsRegistry };
