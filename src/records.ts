import {
  RECORD_STAT_KEYS,
  type DetectedRecord,
  type PlayerStatLine,
  type RecordEntry,
  type RecordHolderRef,
  type RecordScope,
  type RecordStatKey
} from "./types.js";

const PLAYER_RECORD_STATS: RecordStatKey[] = ["points", "rebounds", "assists", "steals", "blocks"];

export function detectNewRecords(priorEntries: RecordEntry[], entry: Omit<RecordEntry, "detectedRecords">): DetectedRecord[] {
  const detected: DetectedRecord[] = [];

  for (const statKey of PLAYER_RECORD_STATS) {
    const previousHolders = getPlayerRecordHolders(priorEntries, statKey);
    const gameBest = entry.stats.reduce((best, line) => Math.max(best, line[statKey]), 0);

    for (const line of entry.stats) {
      const value = line[statKey];
      if (!isRecordOrTie(value, previousHolders?.value) || value !== gameBest) {
        continue;
      }

      if (previousHolders && isExistingHolder(line, previousHolders.holders)) {
        continue;
      }

      const previous = previousHolders?.holders[0];
      detected.push({
        scope: "player",
        statKey,
        value,
        isTie: previousHolders !== undefined && value === previousHolders.value,
        previousValue: previousHolders?.value,
        previousPlayerName: previous?.playerName,
        previousDiscordUserId: previous?.discordUserId,
        previousDiscordDisplayName: previous?.discordDisplayName,
        previousHolders: previousHolders?.holders.map(toHolderRef),
        playerName: line.playerName,
        discordUserId: line.discordUserId,
        discordDisplayName: line.discordDisplayName
      });
    }
  }

  return detected;
}

export function getPlayerRecordHolders(
  entries: RecordEntry[],
  statKey: RecordStatKey
): { value: number; holders: PlayerStatLine[] } | undefined {
  let bestValue = 0;
  const holders: PlayerStatLine[] = [];
  const seen = new Set<string>();

  for (const entry of chronologicalEntries(entries)) {
    for (const line of entry.stats) {
      const value = line[statKey];
      if (value <= 0) {
        continue;
      }

      if (value > bestValue) {
        bestValue = value;
        holders.length = 0;
        seen.clear();
      }

      if (value === bestValue) {
        const key = recordHolderKey(line);
        if (!seen.has(key)) {
          seen.add(key);
          holders.push(line);
        }
      }
    }
  }

  if (bestValue <= 0 || holders.length === 0) {
    return undefined;
  }

  return { value: bestValue, holders };
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

export function isTiedRecord(record: DetectedRecord): boolean {
  return record.isTie === true;
}

function isRecordOrTie(value: number, previousValue: number | undefined): boolean {
  if (value <= 0) {
    return false;
  }

  return previousValue === undefined || value >= previousValue;
}

function isExistingHolder(line: PlayerStatLine, holders: PlayerStatLine[]): boolean {
  const key = recordHolderKey(line);
  return holders.some((holder) => recordHolderKey(holder) === key);
}

function recordHolderKey(line: Pick<PlayerStatLine, "playerName" | "discordUserId">): string {
  return line.discordUserId ?? line.playerName.trim().toLowerCase();
}

function toHolderRef(line: PlayerStatLine): RecordHolderRef {
  return {
    playerName: line.playerName,
    discordUserId: line.discordUserId,
    discordDisplayName: line.discordDisplayName
  };
}

function chronologicalEntries(entries: RecordEntry[]): RecordEntry[] {
  return [...entries].sort((left, right) => new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime());
}
