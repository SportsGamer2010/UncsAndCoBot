import path from "node:path";
import process from "node:process";
import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const defaultDataDir = process.env.NODE_ENV === "production" ? "/data" : path.join(process.cwd(), "data");

const envSchema = z.object({
  DISCORD_TOKEN: z.string().trim().min(1, "DISCORD_TOKEN is required"),
  DISCORD_GUILD_ID: z.string().trim().optional(),
  STATISTICS_CATEGORY_NAME: z.string().trim().default("Statistics"),
  RECORD_BOOK_CHANNEL_NAME: z.string().trim().default("record-book"),
  DATA_DIR: z.string().trim().default(defaultDataDir),
  OCR_LANGUAGE: z.string().trim().default("eng"),
  MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(12 * 1024 * 1024),
  RECORDS_PER_MODE: z.coerce.number().int().min(3).max(20).default(10)
});

export type AppConfig = z.infer<typeof envSchema>;

export function getConfig(): AppConfig {
  const parsed = envSchema.parse(process.env);
  return {
    ...parsed,
    DATA_DIR: normalizeDataDir(parsed.DATA_DIR)
  };
}

function normalizeDataDir(dataDir: string): string {
  if (process.env.NODE_ENV === "production" && !path.isAbsolute(dataDir)) {
    return "/data";
  }

  return dataDir || defaultDataDir;
}
