import { EmbedBuilder, type APIEmbedField } from "discord.js";
import { GAME_MODE_LABELS, GAME_MODES, RECORD_STAT_LABELS, type DetectedRecord, type GameMode, type PlayerStatLine, type RecordEntry, type RecordStatKey } from "./types.js";
import { isClaimConfirmed, parseClaimScope } from "./records.js";

const BRAND_COLOR = 0x1f6feb;

const DISPLAY_RECORD_STATS: RecordStatKey[] = ["points", "rebounds", "assists", "steals", "blocks"];

export function buildOverviewEmbed(channelName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle("Uncs & Co Crew Record Book")
    .setDescription(
      [
        `This channel tracks crew records for ${GAME_MODES.map((mode) => `**${GAME_MODE_LABELS[mode]}**`).join(", ")}.`,
        "",
        "**How records are recorded:**",
        "1. Play your game.",
        "2. Capture the end-of-game box score screenshot.",
        "3. Run `/submit-record`, choose the record you believe was set, and attach the screenshot.",
        "",
        "Only screenshot-backed submissions are saved to the record book. The bot also checks the OCR stats against saved records and flags new records automatically."
      ].join("\n")
    )
    .addFields(
      {
        name: "Required with every submission",
        value: "`mode`, `crew`, `result`, `claimed-record`, and a screenshot attachment."
      },
      {
        name: "Recommended",
        value: "Add opponent and final score when available so standings and point differential stay clean."
      }
    )
    .setFooter({ text: `Post submissions in #${channelName}. Records refresh automatically after approved screenshots.` })
    .setTimestamp(new Date());
}

export function buildModeEmbed(mode: GameMode, entries: RecordEntry[], recordsPerMode: number): EmbedBuilder {
  const modeEntries = entries.filter((entry) => entry.mode === mode);

  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`${GAME_MODE_LABELS[mode]} Records`)
    .setDescription("Crew records and single-game stat records from submitted end-of-game screenshots.")
    .addFields(buildModeFields(modeEntries, recordsPerMode))
    .setFooter({ text: `${modeEntries.length} saved screenshot submission${modeEntries.length === 1 ? "" : "s"}` })
    .setTimestamp(new Date());
}

export function buildSubmissionEmbed(entry: RecordEntry): EmbedBuilder {
  const score = entry.crewScore !== undefined && entry.opponentScore !== undefined
    ? ` | Final: ${entry.crewScore}-${entry.opponentScore}`
    : "";

  return new EmbedBuilder()
    .setColor(entry.result === "win" ? 0x2ea043 : 0xda3633)
    .setTitle("Screenshot Recorded")
    .setDescription(
      [
        `**${entry.crewName}** submitted a **${GAME_MODE_LABELS[entry.mode]}** ${entry.result.toUpperCase()}${score}.`,
        entry.opponentName ? `Opponent: **${entry.opponentName}**` : undefined,
        entry.notes ? `Notes: ${entry.notes}` : undefined
      ]
        .filter(Boolean)
        .join("\n")
    )
    .addFields(
      {
        name: "Team Totals Parsed by OCR",
        value: formatTotals(entry)
      },
      {
        name: "Claimed Record",
        value: formatClaimedRecord(entry)
      },
      {
        name: "New Records Detected",
        value: formatDetectedRecords(entry.detectedRecords)
      },
      {
        name: "Players Found",
        value: entry.stats.length > 0 ? entry.stats.map((line) => `${formatPlayer(line)}: ${line.points} PTS, ${line.rebounds} REB, ${line.assists} AST`).join("\n").slice(0, 1024) : "No player rows parsed."
      }
    )
    .setImage(entry.screenshotUrl)
    .setFooter({ text: `Submitted by ${entry.submittedByTag}` })
    .setTimestamp(new Date(entry.submittedAt));
}

function buildModeFields(entries: RecordEntry[], recordsPerMode: number): APIEmbedField[] {
  if (entries.length === 0) {
    return [
      {
        name: "No records yet",
        value: "Submit an end-of-game screenshot with `/submit-record` to open this record book.",
        inline: false
      }
    ];
  }

  return [
    {
      name: "Crew Standings",
      value: formatCrewStandings(entries),
      inline: false
    },
    {
      name: "Single-Game Team Records",
      value: formatSingleGameRecords(entries, recordsPerMode),
      inline: false
    },
    {
      name: "Individual Single-Game Records",
      value: formatIndividualRecords(entries, recordsPerMode),
      inline: false
    },
    {
      name: "Latest Screenshot Submissions",
      value: formatRecent(entries.slice(0, 5)),
      inline: false
    }
  ];
}

function formatCrewStandings(entries: RecordEntry[]): string {
  const rows = new Map<string, { wins: number; losses: number; pointsFor: number; pointsAgainst: number; games: number }>();

  for (const entry of entries) {
    const current = rows.get(entry.crewName) ?? { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 };
    current.games += 1;
    current.wins += entry.result === "win" ? 1 : 0;
    current.losses += entry.result === "loss" ? 1 : 0;
    current.pointsFor += entry.crewScore ?? 0;
    current.pointsAgainst += entry.opponentScore ?? 0;
    rows.set(entry.crewName, current);
  }

  const sorted = [...rows.entries()]
    .sort(([, a], [, b]) => b.wins - a.wins || a.losses - b.losses || pointDiff(b) - pointDiff(a))
    .slice(0, 10);

  return codeBlock(
    ["Crew                 W-L   DIFF", ...sorted.map(([crew, row]) => `${crew.padEnd(20).slice(0, 20)} ${`${row.wins}-${row.losses}`.padEnd(5)} ${formatDiff(pointDiff(row))}`)].join("\n")
  );
}

function formatSingleGameRecords(entries: RecordEntry[], recordsPerMode: number): string {
  return DISPLAY_RECORD_STATS
    .map((key) => {
      const best = [...entries].sort((a, b) => b.totals[key] - a.totals[key])[0];
      if (!best) {
        return undefined;
      }

      return `**${RECORD_STAT_LABELS[key]}** ${best.totals[key]} - ${best.crewName}${best.opponentName ? ` vs ${best.opponentName}` : ""}`;
    })
    .filter(Boolean)
    .slice(0, recordsPerMode)
    .join("\n");
}

function formatIndividualRecords(entries: RecordEntry[], recordsPerMode: number): string {
  return DISPLAY_RECORD_STATS
    .map((key) => {
      const best = entries.reduce<{ entry: RecordEntry; line: PlayerStatLine } | undefined>((currentBest, entry) => {
        for (const line of entry.stats) {
          if (!currentBest || line[key] > currentBest.line[key]) {
            currentBest = { entry, line };
          }
        }

        return currentBest;
      }, undefined);

      if (!best) {
        return undefined;
      }

      return `**${RECORD_STAT_LABELS[key]}** ${best.line[key]} - ${formatPlayer(best.line)} (${best.entry.crewName})`;
    })
    .filter(Boolean)
    .slice(0, recordsPerMode)
    .join("\n");
}

function formatClaimedRecord(entry: RecordEntry): string {
  if (entry.claimedRecord === "not_sure") {
    return `Submitted as **Not sure - bot check**. ${entry.detectedRecords.length > 0 ? "New record detected." : "No new mode record detected."}`;
  }

  const parsed = parseClaimScope(entry.claimedRecord);
  const label = parsed ? `${parsed.scope === "team" ? "Team" : "Player"} ${RECORD_STAT_LABELS[parsed.statKey]}` : entry.claimedRecord;
  const holder = entry.claimedRecordHolderId ? ` by <@${entry.claimedRecordHolderId}>` : "";
  const status = isClaimConfirmed(entry) ? "confirmed by OCR" : "not confirmed as a new saved record";

  return `**${label}**${holder} - ${status}.`;
}

function formatDetectedRecords(records: DetectedRecord[]): string {
  if (records.length === 0) {
    return "No new all-time mode record was detected from this screenshot.";
  }

  return records
    .map((record) => {
      const holder = record.scope === "player" ? ` - ${record.discordUserId ? `<@${record.discordUserId}>` : record.discordDisplayName ?? record.playerName ?? "Unknown player"}` : "";
      const previous = record.previousValue === undefined ? "first saved mark" : `previous ${record.previousValue}`;
      return `NEW **${record.scope === "team" ? "Team" : "Player"} ${RECORD_STAT_LABELS[record.statKey]}** ${record.value}${holder} (${previous})`;
    })
    .join("\n")
    .slice(0, 1024);
}

function formatRecent(entries: RecordEntry[]): string {
  return entries
    .map((entry) => {
      const score = entry.crewScore !== undefined && entry.opponentScore !== undefined ? ` ${entry.crewScore}-${entry.opponentScore}` : "";
      return `• ${entry.crewName} ${entry.result.toUpperCase()}${score} - <t:${Math.floor(new Date(entry.submittedAt).getTime() / 1000)}:R>`;
    })
    .join("\n");
}

function formatTotals(entry: RecordEntry): string {
  return `${entry.totals.points} PTS | ${entry.totals.rebounds} REB | ${entry.totals.assists} AST | ${entry.totals.steals} STL | ${entry.totals.blocks} BLK | ${entry.totals.turnovers} TO`;
}

function formatPlayer(line: PlayerStatLine): string {
  if (line.discordUserId) {
    return `<@${line.discordUserId}>`;
  }

  return line.discordDisplayName ?? line.playerName;
}

function pointDiff(row: { pointsFor: number; pointsAgainst: number }): number {
  return row.pointsFor - row.pointsAgainst;
}

function formatDiff(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

function codeBlock(value: string): string {
  return `\`\`\`\n${value.slice(0, 1000)}\n\`\`\``;
}
