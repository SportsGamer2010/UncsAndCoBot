import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { GAME_MODES, RECORD_CLAIMS, RECORD_STAT_KEYS, type GameMode, type PublishedRecordBook, type RecordBookData, type RecordEntry } from "./types.js";

const playerStatLineSchema = z.object({
  playerName: z.string(),
  discordUserId: z.string().optional(),
  discordDisplayName: z.string().optional(),
  teammateGrade: z.string().optional(),
  points: z.number(),
  rebounds: z.number(),
  assists: z.number(),
  steals: z.number(),
  blocks: z.number(),
  turnovers: z.number()
});

const statTotalsSchema = z.object({
  points: z.number(),
  rebounds: z.number(),
  assists: z.number(),
  steals: z.number(),
  blocks: z.number(),
  turnovers: z.number()
});

const detectedRecordSchema = z.object({
  scope: z.enum(["player", "team"]),
  statKey: z.enum(RECORD_STAT_KEYS),
  value: z.number(),
  previousValue: z.number().optional(),
  previousPlayerName: z.string().optional(),
  previousDiscordUserId: z.string().optional(),
  previousDiscordDisplayName: z.string().optional(),
  playerName: z.string().optional(),
  discordUserId: z.string().optional(),
  discordDisplayName: z.string().optional()
});

const recordEntrySchema = z.object({
  id: z.string(),
  guildId: z.string(),
  channelId: z.string(),
  messageId: z.string().optional(),
  submittedById: z.string(),
  submittedByTag: z.string(),
  submittedAt: z.string(),
  mode: z.enum(GAME_MODES),
  crewName: z.string(),
  opponentName: z.string().optional(),
  result: z.enum(["win", "loss"]),
  crewScore: z.number().optional(),
  opponentScore: z.number().optional(),
  notes: z.string().optional(),
  claimedRecord: z.enum(RECORD_CLAIMS).default("not_sure"),
  claimedRecordHolderId: z.string().optional(),
  claimedRecordHolderTag: z.string().optional(),
  screenshotUrl: z.string(),
  screenshotHash: z.string(),
  stats: z.array(playerStatLineSchema),
  totals: statTotalsSchema,
  detectedRecords: z.array(detectedRecordSchema).default([]),
  ocrText: z.string()
});

const publishedSchema = z.object({
  channelId: z.string(),
  overviewMessageId: z.string().optional(),
  modeMessageIds: z.partialRecord(z.enum(GAME_MODES), z.string())
});

const recordBookDataSchema = z.object({
  version: z.literal(1),
  entries: z.array(recordEntrySchema),
  published: z.record(z.string(), publishedSchema)
});

const EMPTY_DATA: RecordBookData = {
  version: 1,
  entries: [],
  published: {}
};

export function hashImage(image: Buffer): string {
  return crypto.createHash("sha256").update(image).digest("hex");
}

export class RecordBookStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "record-book.json");
  }

  async read(): Promise<RecordBookData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return recordBookDataSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return EMPTY_DATA;
      }

      throw error;
    }
  }

  async addEntry(entry: RecordEntry): Promise<void> {
    await this.update((data) => {
      const duplicate = data.entries.find((item) => item.screenshotHash === entry.screenshotHash);
      if (duplicate) {
        throw new DuplicateScreenshotError(duplicate);
      }

      data.entries.unshift(entry);
    });
  }

  async setPublished(guildId: string, published: PublishedRecordBook): Promise<void> {
    await this.update((data) => {
      data.published[guildId] = published;
    });
  }

  async getPublished(guildId: string): Promise<PublishedRecordBook | undefined> {
    const data = await this.read();
    return data.published[guildId];
  }

  async entriesForMode(guildId: string, mode: GameMode): Promise<RecordEntry[]> {
    const data = await this.read();
    return data.entries.filter((entry) => entry.guildId === guildId && entry.mode === mode);
  }

  private async update(mutator: (data: RecordBookData) => void): Promise<void> {
    const data = await this.read();
    mutator(data);
    await this.write(data);
  }

  private async write(data: RecordBookData): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }
}

export class DuplicateScreenshotError extends Error {
  constructor(readonly existingEntry: RecordEntry) {
    super("This screenshot has already been submitted.");
  }
}
