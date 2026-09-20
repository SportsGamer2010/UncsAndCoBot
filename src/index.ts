import type { Client } from "discord.js";
import { getConfig } from "./config.js";
import { createBot } from "./bot.js";
import { startHealthServer } from "./health.js";
import { RecordBookStore } from "./storage.js";

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

async function main(): Promise<void> {
  startHealthServer();
  const config = getConfig();
  const store = new RecordBookStore(config.DATA_DIR);
  const client = createBot(config, store);

  await loginWithRetry(client, config.DISCORD_TOKEN);
}

async function loginWithRetry(client: Client, token: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client.login(token);
      return;
    } catch (error) {
      const delayMs = Math.min(30_000, 2000 * attempt);
      console.error(`Discord login failed (attempt ${attempt}). Retrying in ${delayMs}ms.`, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

main().catch((error) => {
  console.error(error);
});
