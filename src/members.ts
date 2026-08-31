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

  const compactLeft = left.replace(/\s+/g, "");
  const compactRight = right.replace(/\s+/g, "");
  const distanceScore = 1 - levenshteinDistance(compactLeft, compactRight) / Math.max(compactLeft.length, compactRight.length, 1);
  if (distanceScore >= 0.72) {
    return distanceScore;
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
    .replace(/0/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left: string, right: string): number {
  const dp = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));

  for (let i = 0; i <= left.length; i += 1) {
    dp[i][0] = i;
  }

  for (let j = 0; j <= right.length; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[left.length][right.length];
}
