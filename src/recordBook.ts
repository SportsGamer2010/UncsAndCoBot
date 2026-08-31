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
        `This channel tracks screenshot-backed player records for ${GAME_MODES.map((mode) => `**${GAME_MODE_LABELS[mode]}**`).join(", ")}.`,
        "",
        "**How records are recorded:**",
        "1. Play your game.",
        "2. Capture the end-of-game box score screenshot.",
        "3. Run `/submit-record`, choose the player record you believe was set, tag the record holder, and attach the screenshot.",
        "",
        "Only screenshot-backed submissions are saved to the record book. The bot also checks the OCR stats against saved records and flags new records automatically."
      ].join("\n")
    )
    .addFields(
      {
        name: "Required with every submission",
        value: "`mode`, `claimed-record`, `record-holder`, and a screenshot attachment."
      },
      {
        name: "Recommended",
        value: "Add opponent and notes when available so staff have context for the screenshot."
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
    .setDescription("Player single-game records from submitted end-of-game screenshots.")
    .addFields(buildModeFields(modeEntries, recordsPerMode))
    .setFooter({ text: `${modeEntries.length} saved screenshot submission${modeEntries.length === 1 ? "" : "s"}` })
    .setTimestamp(new Date());
}

export function buildSubmissionEmbed(entry: RecordEntry): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(entry.detectedRecords.length > 0 ? 0x2ea043 : 0x1f6feb)
    .setTitle("Screenshot Recorded")
    .setDescription(
      [
        `Submitted a **${GAME_MODE_LABELS[entry.mode]}** player-record screenshot.`,
        entry.claimedRecordHolderId ? `Claimed holder: <@${entry.claimedRecordHolderId}>` : undefined,
        entry.opponentName ? `Opponent: **${entry.opponentName}**` : undefined,
        entry.notes ? `Notes: ${entry.notes}` : undefined
      ]
        .filter(Boolean)
        .join("\n")
    )
    .addFields(
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

      return `**${RECORD_STAT_LABELS[key]}** ${best.line[key]} - ${formatPlayer(best.line)}${best.entry.opponentName ? ` vs ${best.entry.opponentName}` : ""}`;
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
      const holder = entry.claimedRecordHolderId ? `<@${entry.claimedRecordHolderId}>` : "Unknown holder";
      return `- ${holder} submitted ${GAME_MODE_LABELS[entry.mode]} - <t:${Math.floor(new Date(entry.submittedAt).getTime() / 1000)}:R>`;
    })
    .join("\n");
}

function formatPlayer(line: PlayerStatLine): string {
  if (line.discordUserId) {
    return `<@${line.discordUserId}>`;
  }

  return line.discordDisplayName ?? line.playerName;
}

