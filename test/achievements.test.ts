import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordRoleSyncActions } from "../src/achievements.js";
import type { DetectedRecord } from "../src/types.js";

describe("recordRoleSyncActions", () => {
  it("keeps existing record-holder roles when a player ties the high", () => {
    const record: DetectedRecord = {
      scope: "player",
      statKey: "rebounds",
      value: 27,
      isTie: true,
      previousValue: 27,
      previousDiscordUserId: "111",
      previousHolders: [{ discordUserId: "111", playerName: "Board King" }],
      discordUserId: "456",
      playerName: "OGSportsGamer"
    };

    assert.deepEqual(recordRoleSyncActions(record), {
      addUserId: "456",
      removeUserIds: []
    });
  });

  it("removes every previous holder when a later mark breaks the tie", () => {
    const record: DetectedRecord = {
      scope: "player",
      statKey: "rebounds",
      value: 28,
      isTie: false,
      previousValue: 27,
      previousDiscordUserId: "111",
      previousHolders: [
        { discordUserId: "111", playerName: "Board King" },
        { discordUserId: "456", playerName: "OGSportsGamer" }
      ],
      discordUserId: "789",
      playerName: "Glass Cleaner"
    };

    assert.deepEqual(recordRoleSyncActions(record), {
      addUserId: "789",
      removeUserIds: ["111", "456"]
    });
  });
});
