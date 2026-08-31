import { getConfig } from "./config.js";
import { createBot } from "./bot.js";
import { RecordBookStore } from "./storage.js";

async function main(): Promise<void> {
  const config = getConfig();
  const store = new RecordBookStore(config.DATA_DIR);
  const client = createBot(config, store);

  await client.login(config.DISCORD_TOKEN);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
