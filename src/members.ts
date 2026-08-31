import type { Guild, GuildMember, User } from "discord.js";
import type { PlayerStatLine } from "./types.js";

export async function attachDiscordMembers(guild: Guild, lines: PlayerStatLine[], claimedHolder?: User | null): Promise<PlayerStatLine[]> {
  let warned = false;

  return Promise.all(
    lines.map(async (line) => {
      const claimedMatch = await matchClaimedHolder(guild, line, claimedHolder);
      if (claimedMatch) {
        return applyMember(line, claimedMatch);
      }

      try {
        const query = searchQuery(line.playerName);
        if (!query) {
          return line;
        }

        const candidates = await guild.members.search({ query, limit: 5 });
        const best = [...candidates.values()]
          .map((member) => ({ member, score: memberScore(line.playerName, member) }))
          .sort((a, b) => b.score - a.score)[0];

        return best && best.score >= 0.58 ? applyMember(line, best.member) : line;
      } catch (error) {
        if (!warned) {
          warned = true;
          console.warn("Discord member search unavailable; keeping OCR player names.", error);
        }

        return line;
      }
    })
  );
}

async function matchClaimedHolder(guild: Guild, line: PlayerStatLine, claimedHolder?: User | null): Promise<GuildMember | undefined> {
  if (!claimedHolder) {
    return undefined;
  }

  const member = await guild.members.fetch(claimedHolder.id).catch(() => undefined);
  if (!member) {
    return undefined;
  }

  return memberScore(line.playerName, member) >= 0.35 ? member : undefined;
}

function applyMember(line: PlayerStatLine, member: GuildMember): PlayerStatLine {
  return {
    ...line,
    discordUserId: member.id,
    discordDisplayName: member.displayName
  };
}

function memberScore(playerName: string, member: GuildMember): number {
  const ocr = normalize(playerName);
  const names = [member.displayName, member.user.globalName, member.user.username].filter(Boolean).map((name) => normalize(String(name)));

  if (!ocr || names.length === 0) {
    return 0;
  }

  return Math.max(...names.map((name) => compareNames(ocr, name)));
}

function compareNames(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.85;
  }

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const largest = Math.max(leftTokens.size, rightTokens.size, 1);

  return overlap / largest;
}

function searchQuery(name: string): string {
  return name
    .replace(/[^A-Za-z0-9_ .'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
