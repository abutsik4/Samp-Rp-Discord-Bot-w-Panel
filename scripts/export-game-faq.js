"use strict";

const fs = require("fs/promises");
const path = require("path");

const { buildGameFaqMarkdown } = require("../src/features/game-faq");

async function main() {
  const outputPath = path.resolve(__dirname, "..", "GAMEPLAY_FAQ_RU.md");
  const content = `${buildGameFaqMarkdown()}\n`;
  await fs.writeFile(outputPath, content, "utf8");
  console.log(`Gameplay FAQ exported to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});