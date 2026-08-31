export const GAME_MODES = ["rec", "pro_am", "theater"] as const;

export type GameMode = (typeof GAME_MODES)[number];

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  rec: "Rec",
  pro_am: "Pro-Am",
  theater: "Theater"
};

export type GameResult = "win" | "loss";

export interface PlayerStatLine {
  playerName: string;
  teammateGrade?: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
}

export interface ParsedStats {
  playerLines: PlayerStatLine[];
  rawText: string;
  confidence?: number;
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
  screenshotUrl: string;
  screenshotHash: string;
  stats: PlayerStatLine[];
  totals: Omit<PlayerStatLine, "playerName" | "teammateGrade">;
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
