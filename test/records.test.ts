import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { detectNewRecords, getPlayerRecordHolders } from "../src/records.js";
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

    assert(records.some((record) => record.scope === "player" && record.statKey === "points" && record.value === 45 && record.discordUserId === "123" && !record.isTie));
    assert(records.some((record) => record.scope === "player" && record.statKey === "blocks" && record.value === 7 && record.discordUserId === "456" && !record.isTie));
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

  it("detects a tie when a different player matches an existing high", () => {
    const prior = makeEntry({
      submittedAt: "2026-01-01T00:00:00.000Z",
      totals: { points: 40, rebounds: 27, assists: 8, steals: 2, blocks: 1, turnovers: 3 },
      stats: [{ playerName: "Board King", discordUserId: "111", discordDisplayName: "Board King", points: 12, rebounds: 27, assists: 2, steals: 1, blocks: 1, turnovers: 2 }]
    });
    const current = makeEntry({
      submittedAt: "2026-01-02T00:00:00.000Z",
      totals: { points: 36, rebounds: 27, assists: 6, steals: 1, blocks: 0, turnovers: 2 },
      stats: [{ playerName: "OGSportsGamer", discordUserId: "456", discordDisplayName: "OGSportsGamer", points: 18, rebounds: 27, assists: 3, steals: 1, blocks: 0, turnovers: 1 }]
    });

    const records = detectNewRecords([prior], current);
    const reboundTie = records.find((record) => record.statKey === "rebounds");

    assert.equal(records.length, 1);
    assert.equal(reboundTie?.isTie, true);
    assert.equal(reboundTie?.value, 27);
    assert.equal(reboundTie?.discordUserId, "456");
    assert.equal(reboundTie?.previousValue, 27);
    assert.equal(reboundTie?.previousDiscordUserId, "111");
    assert.deepEqual(
      reboundTie?.previousHolders?.map((holder) => holder.discordUserId),
      ["111"]
    );
  });

  it("does not detect a tie when the current holder matches their own high", () => {
    const prior = makeEntry({
      totals: { points: 40, rebounds: 27, assists: 8, steals: 2, blocks: 1, turnovers: 3 },
      stats: [{ playerName: "OGSportsGamer", discordUserId: "456", discordDisplayName: "OGSportsGamer", points: 18, rebounds: 27, assists: 3, steals: 1, blocks: 0, turnovers: 1 }]
    });
    const current = makeEntry({
      totals: { points: 34, rebounds: 27, assists: 5, steals: 1, blocks: 0, turnovers: 2 },
      stats: [{ playerName: "OGSportsGamer", discordUserId: "456", discordDisplayName: "OGSportsGamer", points: 16, rebounds: 27, assists: 2, steals: 0, blocks: 0, turnovers: 1 }]
    });

    assert.equal(detectNewRecords([prior], current).length, 0);
  });

  it("detects a later higher mark as a broken record after a tie", () => {
    const first = makeEntry({
      submittedAt: "2026-01-01T00:00:00.000Z",
      totals: { points: 40, rebounds: 27, assists: 8, steals: 2, blocks: 1, turnovers: 3 },
      stats: [{ playerName: "Board King", discordUserId: "111", discordDisplayName: "Board King", points: 12, rebounds: 27, assists: 2, steals: 1, blocks: 1, turnovers: 2 }]
    });
    const tied = makeEntry({
      submittedAt: "2026-01-02T00:00:00.000Z",
      totals: { points: 36, rebounds: 27, assists: 6, steals: 1, blocks: 0, turnovers: 2 },
      stats: [{ playerName: "OGSportsGamer", discordUserId: "456", discordDisplayName: "OGSportsGamer", points: 18, rebounds: 27, assists: 3, steals: 1, blocks: 0, turnovers: 1 }]
    });
    const breaker = makeEntry({
      submittedAt: "2026-01-03T00:00:00.000Z",
      totals: { points: 30, rebounds: 28, assists: 4, steals: 1, blocks: 1, turnovers: 2 },
      stats: [{ playerName: "Glass Cleaner", discordUserId: "789", discordDisplayName: "Glass Cleaner", points: 14, rebounds: 28, assists: 2, steals: 1, blocks: 1, turnovers: 1 }]
    });

    const records = detectNewRecords([first, tied], breaker);
    const broken = records.find((record) => record.statKey === "rebounds");

    assert.equal(broken?.isTie, false);
    assert.equal(broken?.value, 28);
    assert.equal(broken?.previousValue, 27);
    assert.deepEqual(
      broken?.previousHolders?.map((holder) => holder.discordUserId).sort(),
      ["111", "456"]
    );
  });
});

describe("getPlayerRecordHolders", () => {
  it("lists every holder of a tied high", () => {
    const first = makeEntry({
      submittedAt: "2026-01-01T00:00:00.000Z",
      totals: { points: 40, rebounds: 27, assists: 8, steals: 2, blocks: 1, turnovers: 3 },
      stats: [{ playerName: "Board King", discordUserId: "111", discordDisplayName: "Board King", points: 12, rebounds: 27, assists: 2, steals: 1, blocks: 1, turnovers: 2 }]
    });
    const tied = makeEntry({
      submittedAt: "2026-01-02T00:00:00.000Z",
      totals: { points: 36, rebounds: 27, assists: 6, steals: 1, blocks: 0, turnovers: 2 },
      stats: [{ playerName: "OGSportsGamer", discordUserId: "456", discordDisplayName: "OGSportsGamer", points: 18, rebounds: 27, assists: 3, steals: 1, blocks: 0, turnovers: 1 }]
    });

    const holders = getPlayerRecordHolders([tied, first], "rebounds");

    assert.equal(holders?.value, 27);
    assert.deepEqual(
      holders?.holders.map((line) => line.discordUserId),
      ["111", "456"]
    );
  });

  it("keeps only the later higher mark after a tie is broken", () => {
    const first = makeEntry({
      submittedAt: "2026-01-01T00:00:00.000Z",
      totals: { points: 40, rebounds: 27, assists: 8, steals: 2, blocks: 1, turnovers: 3 },
      stats: [{ playerName: "Board King", discordUserId: "111", points: 12, rebounds: 27, assists: 2, steals: 1, blocks: 1, turnovers: 2 }]
    });
    const tied = makeEntry({
      submittedAt: "2026-01-02T00:00:00.000Z",
      totals: { points: 36, rebounds: 27, assists: 6, steals: 1, blocks: 0, turnovers: 2 },
      stats: [{ playerName: "OGSportsGamer", discordUserId: "456", points: 18, rebounds: 27, assists: 3, steals: 1, blocks: 0, turnovers: 1 }]
    });
    const breaker = makeEntry({
      submittedAt: "2026-01-03T00:00:00.000Z",
      totals: { points: 30, rebounds: 28, assists: 4, steals: 1, blocks: 1, turnovers: 2 },
      stats: [{ playerName: "Glass Cleaner", discordUserId: "789", points: 14, rebounds: 28, assists: 2, steals: 1, blocks: 1, turnovers: 1 }]
    });

    const holders = getPlayerRecordHolders([breaker, tied, first], "rebounds");

    assert.equal(holders?.value, 28);
    assert.deepEqual(
      holders?.holders.map((line) => line.discordUserId),
      ["789"]
    );
  });
});

function makeEntry(overrides: Pick<RecordEntry, "totals" | "stats"> & Partial<Pick<RecordEntry, "submittedAt">>): Omit<RecordEntry, "detectedRecords"> {
  return {
    id: crypto.randomUUID(),
    guildId: "guild",
    channelId: "channel",
    submittedById: "user",
    submittedByTag: "user#0000",
    submittedAt: overrides.submittedAt ?? new Date().toISOString(),
    mode: "rec",
    crewName: "Uncs & Co",
    result: "win",
    claimedRecord: "not_sure",
    screenshotUrl: "https://example.com/screenshot.png",
    screenshotHash: crypto.randomUUID(),
    ocrText: "",
    totals: overrides.totals,
    stats: overrides.stats
  };
}
