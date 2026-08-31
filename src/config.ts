import path from "node:path";
import process from "node:process";
import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_GUILD_ID: z.string().optional(),
  STATISTICS_CATEGORY_NAME: z.string().default("Statistics"),
  RECORD_BOOK_CHANNEL_NAME: z.string().default("record-book"),
  DATA_DIR: z.string().default(path.join(process.cwd(), "data")),
  OCR_LANGUAGE: z.string().default("eng"),
  MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(12 * 1024 * 1024),
  RECORDS_PER_MODE: z.coerce.number().int().min(3).max(20).default(10)
});

export type AppConfig = z.infer<typeof envSchema>;

export function getConfig(): AppConfig {
  return envSchema.parse(process.env);
}
