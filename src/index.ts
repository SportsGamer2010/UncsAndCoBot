import { REST, Routes, type Client } from "discord.js";
import { getConfig } from "./config.js";
import { createBot } from "./bot.js";
import { startHealthServer, type HealthState } from "./health.js";
import { RecordBookStore } from "./storage.js";

const healthState: HealthState = { discordReady: false };

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
  healthState.lastError = stringifyError(error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  healthState.lastError = stringifyError(error);
});

async function main(): Promise<void> {
  startHealthServer(process.env.PORT, () => healthState);

  const config = getConfig();
  await assertDiscordToken(config.DISCORD_TOKEN);

  const store = new RecordBookStore(config.DATA_DIR);
  const client = createBot(config, store);
  client.once("ready", () => {
    healthState.discordReady = true;
    healthState.lastError = undefined;
    console.log(`Discord gateway ready as ${client.user?.tag}. Health checks will now pass.`);
  });

  await loginWithRetry(client, config.DISCORD_TOKEN);
}

async function assertDiscordToken(token: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  const application = (await rest.get(Routes.oauth2CurrentApplication())) as { id?: string; name?: string };
  const user = (await rest.get(Routes.user())) as { id?: string; username?: string };
  console.log(`Discord token is valid for application ${application.name ?? "unknown"} (${application.id ?? "unknown"}) as @${user.username ?? "unknown"} (${user.id ?? "unknown"}).`);
}

async function loginWithRetry(client: Client, token: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client.login(token);
      return;
    } catch (error) {
      healthState.lastError = stringifyError(error);
      const delayMs = Math.min(30_000, 2000 * attempt);
      console.error(`Discord login failed (attempt ${attempt}). Retrying in ${delayMs}ms.`, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  healthState.lastError = stringifyError(error);
  console.error(error);
});
