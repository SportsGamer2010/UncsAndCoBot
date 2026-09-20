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

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse({
    DISCORD_TOKEN: blankToUndefined(env.DISCORD_TOKEN),
    DISCORD_GUILD_ID: blankToUndefined(env.DISCORD_GUILD_ID),
    STATISTICS_CATEGORY_NAME: blankToUndefined(env.STATISTICS_CATEGORY_NAME),
    RECORD_BOOK_CHANNEL_NAME: blankToUndefined(env.RECORD_BOOK_CHANNEL_NAME),
    DATA_DIR: blankToUndefined(env.DATA_DIR),
    OCR_LANGUAGE: blankToUndefined(env.OCR_LANGUAGE),
    MAX_IMAGE_BYTES: blankToUndefined(env.MAX_IMAGE_BYTES),
    RECORDS_PER_MODE: blankToUndefined(env.RECORDS_PER_MODE)
  });

  return {
    ...parsed,
    DATA_DIR: normalizeDataDir(parsed.DATA_DIR)
  };
}

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return value;
}

function normalizeDataDir(dataDir: string): string {
  if (process.env.NODE_ENV === "production" && !path.isAbsolute(dataDir)) {
    return "/data";
  }

  return dataDir || defaultDataDir;
}
