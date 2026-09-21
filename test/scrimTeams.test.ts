import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { ChannelType } from "discord.js";
import {
  buildScrimTeamsEmbed,
  formatTeamLines,
  isGuildTextChannelType,
  ScrimTeamsStore,
  type ScrimPlayer,
  type ScrimTeamsSnapshot
} from "../src/scrimTeams.js";

function samplePlayers(prefix: string): ScrimPlayer[] {
  return [1, 2, 3, 4, 5].map((n) => ({
    id: `${prefix}${n}`,
    tag: `${prefix}User${n}`,
    displayName: `${prefix} Player ${n}`
  }));
}

function sampleSnapshot(): ScrimTeamsSnapshot {
  return {
    guildId: "guild-1",
    channelId: "channel-1",
    team1Name: "Team Heat",
    team2Name: "Team Ice",
    team1: samplePlayers("a"),
    team2: samplePlayers("b"),
    updatedById: "updater-1",
    updatedByTag: "SportsGamer",
    updatedAt: "2026-09-21T20:00:00.000Z"
  };
}

describe("scrim teams helpers", () => {
  it("formats numbered mention lines", () => {
    const lines = formatTeamLines(samplePlayers("x"));
    assert.match(lines, /^1\. <@x1>\n2\. <@x2>\n3\. <@x3>\n4\. <@x4>\n5\. <@x5>$/);
  });

  it("builds an embed titled Current Scrim Teams", () => {
    const embed = buildScrimTeamsEmbed(sampleSnapshot()).toJSON();
    assert.equal(embed.title, "Current Scrim Teams");
    assert.equal(embed.fields?.[0]?.name, "Team Heat");
    assert.equal(embed.fields?.[1]?.name, "Team Ice");
    assert.match(String(embed.footer?.text ?? ""), /Updated by SportsGamer/);
  });

  it("only allows guild text and announcement channels", () => {
    assert.equal(isGuildTextChannelType(ChannelType.GuildText), true);
    assert.equal(isGuildTextChannelType(ChannelType.GuildAnnouncement), true);
    assert.equal(isGuildTextChannelType(ChannelType.GuildVoice), false);
    assert.equal(isGuildTextChannelType(ChannelType.GuildStageVoice), false);
    assert.equal(isGuildTextChannelType(null), false);
  });
});

describe("ScrimTeamsStore", () => {
  it("saves and loads a guild snapshot", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "scrim-teams-"));
    try {
      const store = new ScrimTeamsStore(dir);
      const snapshot = sampleSnapshot();
      await store.set(snapshot);
      const loaded = await store.get("guild-1");
      assert.deepEqual(loaded, snapshot);
      assert.equal(await store.get("missing"), undefined);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
