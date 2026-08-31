import {
  RECORD_STAT_KEYS,
  type DetectedRecord,
  type PlayerStatLine,
  type RecordEntry,
  type RecordScope,
  type RecordStatKey,
  type StatTotals
} from "./types.js";

export function detectNewRecords(priorEntries: RecordEntry[], entry: Omit<RecordEntry, "detectedRecords">): DetectedRecord[] {
  const detected: DetectedRecord[] = [];

  for (const statKey of RECORD_STAT_KEYS) {
    const previousTeamBest = bestTeamRecord(priorEntries, statKey);
    if (isNewRecord(entry.totals[statKey], previousTeamBest?.value)) {
      detected.push({
        scope: "team",
        statKey,
        value: entry.totals[statKey],
        previousValue: previousTeamBest?.value
      });
    }

    const previousPlayerBest = bestPlayerRecord(priorEntries, statKey);
    const currentPlayerBest = bestCurrentPlayerRecord(entry.stats, statKey);
    if (currentPlayerBest && isNewRecord(currentPlayerBest[statKey], previousPlayerBest?.value)) {
      detected.push({
        scope: "player",
        statKey,
        value: currentPlayerBest[statKey],
        previousValue: previousPlayerBest?.value,
        previousPlayerName: previousPlayerBest?.line.playerName,
        previousDiscordUserId: previousPlayerBest?.line.discordUserId,
        previousDiscordDisplayName: previousPlayerBest?.line.discordDisplayName,
        playerName: currentPlayerBest.playerName,
        discordUserId: currentPlayerBest.discordUserId,
        discordDisplayName: currentPlayerBest.discordDisplayName
      });
    }
  }

  return detected;
}

export function parseClaimScope(claim: string): { scope: RecordScope; statKey: RecordStatKey } | undefined {
  const [scope, statKey] = claim.split("_") as [RecordScope, RecordStatKey];
  if ((scope !== "player" && scope !== "team") || !RECORD_STAT_KEYS.includes(statKey)) {
    return undefined;
  }

  return { scope, statKey };
}

export function isClaimConfirmed(entry: RecordEntry): boolean {
  const parsedClaim = parseClaimScope(entry.claimedRecord);
  if (!parsedClaim) {
    return entry.detectedRecords.length > 0;
  }

  return entry.detectedRecords.some((record) => record.scope === parsedClaim.scope && record.statKey === parsedClaim.statKey);
}

function bestTeamRecord(entries: RecordEntry[], statKey: RecordStatKey): { value: number; totals: StatTotals } | undefined {
  return entries.reduce<{ value: number; totals: StatTotals } | undefined>((best, entry) => {
    const value = entry.totals[statKey];
    if (!best || value > best.value) {
      return { value, totals: entry.totals };
    }

    return best;
  }, undefined);
}

function bestPlayerRecord(entries: RecordEntry[], statKey: RecordStatKey): { value: number; line: PlayerStatLine } | undefined {
  return entries.reduce<{ value: number; line: PlayerStatLine } | undefined>((best, entry) => {
    for (const line of entry.stats) {
      const value = line[statKey];
      if (!best || value > best.value) {
        best = { value, line };
      }
    }

    return best;
  }, undefined);
}

function bestCurrentPlayerRecord(lines: PlayerStatLine[], statKey: RecordStatKey): PlayerStatLine | undefined {
  return lines.reduce<PlayerStatLine | undefined>((best, line) => {
    if (!best || line[statKey] > best[statKey]) {
      return line;
    }

    return best;
  }, undefined);
}

function isNewRecord(value: number, previousValue: number | undefined): boolean {
  if (value <= 0) {
    return false;
  }

  return previousValue === undefined || value > previousValue;
}
