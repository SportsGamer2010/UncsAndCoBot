export const GAME_MODES = ["rec", "pro_am", "theater"] as const;

export type GameMode = (typeof GAME_MODES)[number];

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  rec: "Rec",
  pro_am: "Pro-Am",
  theater: "Theater"
};

export type GameResult = "win" | "loss";

export const RECORD_STAT_KEYS = ["points", "rebounds", "assists", "steals", "blocks", "turnovers"] as const;

export type RecordStatKey = (typeof RECORD_STAT_KEYS)[number];

export const RECORD_STAT_LABELS: Record<RecordStatKey, string> = {
  points: "PTS",
  rebounds: "REB",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  turnovers: "TO"
};

export const RECORD_CLAIMS = [
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_steals",
  "player_blocks",
  "player_turnovers",
  "team_points",
  "team_rebounds",
  "team_assists",
  "team_steals",
  "team_blocks",
  "team_turnovers",
  "not_sure"
] as const;

export type RecordClaim = (typeof RECORD_CLAIMS)[number];

export type RecordScope = "player" | "team";

export interface PlayerStatLine {
  playerName: string;
  discordUserId?: string;
  discordDisplayName?: string;
  teammateGrade?: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
}

export type StatTotals = Record<RecordStatKey, number>;

export interface ParsedStats {
  playerLines: PlayerStatLine[];
  rawText: string;
  confidence?: number;
}

export interface DetectedRecord {
  scope: RecordScope;
  statKey: RecordStatKey;
  value: number;
  previousValue?: number;
  playerName?: string;
  discordUserId?: string;
  discordDisplayName?: string;
}

export interface RecordEntry {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  submittedById: string;
  submittedByTag: string;
  submittedAt: string;
  mode: GameMode;
  crewName: string;
  opponentName?: string;
  result: GameResult;
  crewScore?: number;
  opponentScore?: number;
  notes?: string;
  claimedRecord: RecordClaim;
  claimedRecordHolderId?: string;
  claimedRecordHolderTag?: string;
  screenshotUrl: string;
  screenshotHash: string;
  stats: PlayerStatLine[];
  totals: StatTotals;
  detectedRecords: DetectedRecord[];
  ocrText: string;
}

export interface PublishedRecordBook {
  channelId: string;
  overviewMessageId?: string;
  modeMessageIds: Partial<Record<GameMode, string>>;
}

export interface RecordBookData {
  version: 1;
  entries: RecordEntry[];
  published: Record<string, PublishedRecordBook>;
}
