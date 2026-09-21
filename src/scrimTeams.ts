import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ChannelType, EmbedBuilder } from "discord.js";
import { z } from "zod";

export interface ScrimPlayer {
  id: string;
  tag: string;
  displayName: string;
}

export interface ScrimTeamsSnapshot {
  guildId: string;
  channelId: string;
  team1Name: string;
  team2Name: string;
  team1: ScrimPlayer[];
  team2: ScrimPlayer[];
  updatedById: string;
  updatedByTag: string;
  updatedAt: string;
}

const playerSchema = z.object({
  id: z.string().min(1),
  tag: z.string().min(1),
  displayName: z.string().min(1)
});

const snapshotSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  team1Name: z.string().min(1),
  team2Name: z.string().min(1),
  team1: z.array(playerSchema).length(5),
  team2: z.array(playerSchema).length(5),
  updatedById: z.string().min(1),
  updatedByTag: z.string().min(1),
  updatedAt: z.string().min(1)
});

const fileSchema = z.object({
  version: z.literal(1),
  byGuild: z.record(z.string(), snapshotSchema)
});

type ScrimTeamsFile = z.infer<typeof fileSchema>;

const EMPTY: ScrimTeamsFile = { version: 1, byGuild: {} };

export function isGuildTextChannelType(type: ChannelType | number | null | undefined): boolean {
  return type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement;
}

export function formatTeamLines(players: ScrimPlayer[]): string {
  return players.map((player, index) => `${index + 1}. <@${player.id}>`).join("\n");
}

export function buildScrimTeamsEmbed(snapshot: ScrimTeamsSnapshot): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xc45c26)
    .setTitle("Current Scrim Teams")
    .addFields(
      {
        name: snapshot.team1Name || "Team 1",
        value: formatTeamLines(snapshot.team1),
        inline: true
      },
      {
        name: snapshot.team2Name || "Team 2",
        value: formatTeamLines(snapshot.team2),
        inline: true
      }
    )
    .setFooter({ text: `Updated by ${snapshot.updatedByTag}` })
    .setTimestamp(new Date(snapshot.updatedAt));
}

export class ScrimTeamsStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "scrim-teams.json");
  }

  async get(guildId: string): Promise<ScrimTeamsSnapshot | undefined> {
    const data = await this.read();
    return data.byGuild[guildId];
  }

  async set(snapshot: ScrimTeamsSnapshot): Promise<void> {
    const parsed = snapshotSchema.parse(snapshot);
    await this.update((data) => {
      data.byGuild[parsed.guildId] = parsed;
    });
  }

  private async read(): Promise<ScrimTeamsFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return fileSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return EMPTY;
      }
      throw error;
    }
  }

  private async update(mutator: (data: ScrimTeamsFile) => void): Promise<void> {
    const data = await this.read();
    mutator(data);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }
}
