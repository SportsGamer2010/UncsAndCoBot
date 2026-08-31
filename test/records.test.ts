import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { detectNewRecords } from "../src/records.js";
import type { RecordEntry } from "../src/types.js";

describe("detectNewRecords", () => {
  it("detects new player records against prior entries", () => {
    const prior = makeEntry({
      totals: { points: 82, rebounds: 21, assists: 18, steals: 5, blocks: 3, turnovers: 6 },
      stats: [
        { playerName: "Old Guard", points: 32, rebounds: 2, assists: 8, steals: 1, blocks: 0, turnovers: 2 },
        { playerName: "Old Rim", points: 8, rebounds: 11, assists: 1, steals: 1, blocks: 5, turnovers: 1 }
      ]
    });
    const current = makeEntry({
      totals: { points: 95, rebounds: 20, assists: 19, steals: 4, blocks: 2, turnovers: 5 },
      stats: [
        { playerName: "Unc Buckets", discordUserId: "123", discordDisplayName: "Unc Buckets", points: 45, rebounds: 3, assists: 7, steals: 2, blocks: 0, turnovers: 1 },
        { playerName: "OGSportsGamer", discordUserId: "456", discordDisplayName: "OGSportsGamer", points: 0, rebounds: 17, assists: 1, steals: 0, blocks: 7, turnovers: 2 }
      ]
    });

    const records = detectNewRecords([prior], current);

    assert(records.some((record) => record.scope === "player" && record.statKey === "points" && record.value === 45 && record.discordUserId === "123"));
    assert(records.some((record) => record.scope === "player" && record.statKey === "blocks" && record.value === 7 && record.discordUserId === "456"));
    assert(!records.some((record) => record.scope === "team"));
  });

  it("does not detect records when values do not beat prior highs", () => {
    const prior = makeEntry({
      totals: { points: 100, rebounds: 30, assists: 25, steals: 10, blocks: 8, turnovers: 4 },
      stats: [{ playerName: "Old Guard", points: 50, rebounds: 10, assists: 12, steals: 5, blocks: 4, turnovers: 1 }]
    });
    const current = makeEntry({
      totals: { points: 80, rebounds: 20, assists: 15, steals: 4, blocks: 2, turnovers: 3 },
      stats: [{ playerName: "Unc Buckets", points: 35, rebounds: 8, assists: 9, steals: 2, blocks: 1, turnovers: 1 }]
    });

    assert.equal(detectNewRecords([prior], current).length, 0);
  });
});

function makeEntry(overrides: Pick<RecordEntry, "totals" | "stats">): Omit<RecordEntry, "detectedRecords"> {
  return {
    id: crypto.randomUUID(),
    guildId: "guild",
    channelId: "channel",
    submittedById: "user",
    submittedByTag: "user#0000",
    submittedAt: new Date().toISOString(),
    mode: "rec",
    crewName: "Uncs & Co",
    result: "win",
    claimedRecord: "not_sure",
    screenshotUrl: "https://example.com/screenshot.png",
    screenshotHash: crypto.randomUUID(),
    ocrText: "",
    ...overrides
  };
}
