import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { buildModeEmbed, buildPublicSubmissionEmbed, publicSubmissionCopy } from "../src/recordBook.js";
import type { DetectedRecord, RecordEntry } from "../src/types.js";

describe("record book ties", () => {
  it("lists every tied holder in the mode embed", () => {
    const entries = [
      makeSavedEntry({
        submittedAt: "2026-01-02T00:00:00.000Z",
        stats: [{ playerName: "OGSportsGamer", discordUserId: "456", discordDisplayName: "OGSportsGamer", points: 18, rebounds: 27, assists: 3, steals: 1, blocks: 0, turnovers: 1 }]
      }),
      makeSavedEntry({
        submittedAt: "2026-01-01T00:00:00.000Z",
        stats: [{ playerName: "Board King", discordUserId: "111", discordDisplayName: "Board King", points: 12, rebounds: 27, assists: 2, steals: 1, blocks: 1, turnovers: 2 }]
      })
    ];

    const embed = buildModeEmbed("rec", entries, 10);
    const individual = embed.data.fields?.find((field) => field.name === "Individual Single-Game Records");

    assert.match(String(individual?.value), /\*\*REB\*\* 27 - <@111>, <@456>/);
  });

  it("lists only the later higher mark after a tie is broken", () => {
    const entries = [
      makeSavedEntry({
        submittedAt: "2026-01-03T00:00:00.000Z",
        stats: [{ playerName: "Glass Cleaner", discordUserId: "789", points: 14, rebounds: 28, assists: 2, steals: 1, blocks: 1, turnovers: 1 }]
      }),
      makeSavedEntry({
        submittedAt: "2026-01-02T00:00:00.000Z",
        stats: [{ playerName: "OGSportsGamer", discordUserId: "456", points: 18, rebounds: 27, assists: 3, steals: 1, blocks: 0, turnovers: 1 }]
      }),
      makeSavedEntry({
        submittedAt: "2026-01-01T00:00:00.000Z",
        stats: [{ playerName: "Board King", discordUserId: "111", points: 12, rebounds: 27, assists: 2, steals: 1, blocks: 1, turnovers: 2 }]
      })
    ];

    const embed = buildModeEmbed("rec", entries, 10);
    const individual = embed.data.fields?.find((field) => field.name === "Individual Single-Game Records");

    const reboundLine = String(individual?.value)
      .split("\n")
      .find((line) => line.startsWith("**REB**"));

    assert.equal(reboundLine, "**REB** 28 - <@789>");
  });

  it("announces a tie instead of a new record", () => {
    const entry = makeSavedEntry({
      claimedRecordHolderId: "456",
      detectedRecords: [
        {
          scope: "player",
          statKey: "rebounds",
          value: 27,
          isTie: true,
          previousValue: 27,
          previousDiscordUserId: "111",
          discordUserId: "456",
          playerName: "OGSportsGamer"
        }
      ]
    });

    const copy = publicSubmissionCopy(entry);
    const embed = buildPublicSubmissionEmbed(entry);

    assert.equal(copy.title, "Tied Rec Player Record");
    assert.equal(copy.content, "Player record tied.");
    assert.equal(embed.data.title, "Tied Rec Player Record");
    assert.match(String(embed.data.description), /TIED \*\*Player REB\*\* 27 - <@456> \(tied existing 27\)/);
  });

  it("announces a broken record after a higher mark", () => {
    const entry = makeSavedEntry({
      claimedRecordHolderId: "789",
      detectedRecords: [
        {
          scope: "player",
          statKey: "rebounds",
          value: 28,
          isTie: false,
          previousValue: 27,
          previousHolders: [
            { discordUserId: "111", playerName: "Board King" },
            { discordUserId: "456", playerName: "OGSportsGamer" }
          ],
          discordUserId: "789",
          playerName: "Glass Cleaner"
        }
      ]
    });

    const copy = publicSubmissionCopy(entry);

    assert.equal(copy.title, "New Rec Player Record");
    assert.equal(copy.content, "New player record set.");
    assert.match(String(buildPublicSubmissionEmbed(entry).data.description), /NEW \*\*Player REB\*\* 28 - <@789> \(previous 27\)/);
  });
});

function makeSavedEntry(
  overrides: Partial<Pick<RecordEntry, "submittedAt" | "claimedRecordHolderId" | "detectedRecords">> & {
    stats?: RecordEntry["stats"];
  }
): RecordEntry {
  const stats = overrides.stats ?? [{ playerName: "Unc", points: 10, rebounds: 4, assists: 2, steals: 1, blocks: 0, turnovers: 1 }];
  const totals = stats.reduce(
    (sum, line) => ({
      points: sum.points + line.points,
      rebounds: sum.rebounds + line.rebounds,
      assists: sum.assists + line.assists,
      steals: sum.steals + line.steals,
      blocks: sum.blocks + line.blocks,
      turnovers: sum.turnovers + line.turnovers
    }),
    { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0 }
  );

  return {
    id: crypto.randomUUID(),
    guildId: "guild",
    channelId: "channel",
    submittedById: "user",
    submittedByTag: "user#0000",
    submittedAt: overrides.submittedAt ?? "2026-01-01T00:00:00.000Z",
    mode: "rec",
    claimedRecord: "player_rebounds",
    claimedRecordHolderId: overrides.claimedRecordHolderId,
    screenshotUrl: "https://example.com/screenshot.png",
    screenshotHash: crypto.randomUUID(),
    stats,
    totals,
    detectedRecords: overrides.detectedRecords ?? ([] as DetectedRecord[]),
    ocrText: ""
  };
}
