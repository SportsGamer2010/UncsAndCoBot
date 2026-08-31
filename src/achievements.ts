import { Colors, type Guild } from "discord.js";
import { GAME_MODE_LABELS, RECORD_STAT_LABELS, type RecordEntry, type RecordStatKey } from "./types.js";

const ROLE_RECORD_STATS = new Set<RecordStatKey>(["points", "rebounds", "assists", "steals", "blocks"]);

export async function syncAchievementRoles(guild: Guild, entry: RecordEntry): Promise<void> {
  for (const record of entry.detectedRecords) {
    if (record.scope !== "player" || !record.discordUserId || !ROLE_RECORD_STATS.has(record.statKey)) {
      continue;
    }

    const role = await ensureRecordRole(guild, entry.mode, record.statKey);
    const newHolder = await guild.members.fetch(record.discordUserId).catch(() => undefined);
    if (!newHolder) {
      continue;
    }

    if (record.previousDiscordUserId && record.previousDiscordUserId !== record.discordUserId) {
      const previousHolder = await guild.members.fetch(record.previousDiscordUserId).catch(() => undefined);
      await previousHolder?.roles.remove(role, `${record.discordDisplayName ?? record.playerName} broke the ${role.name} record.`).catch((error) => {
        console.warn(`Could not remove ${role.name} from previous holder ${record.previousDiscordUserId}:`, error);
      });
    }

    await newHolder.roles.add(role, `Verified ${GAME_MODE_LABELS[entry.mode]} ${RECORD_STAT_LABELS[record.statKey]} record from screenshot OCR.`).catch((error) => {
      console.warn(`Could not add ${role.name} to ${record.discordUserId}:`, error);
    });
  }
}

async function ensureRecordRole(guild: Guild, mode: RecordEntry["mode"], statKey: RecordStatKey) {
  const roleName = `${GAME_MODE_LABELS[mode]} ${RECORD_STAT_LABELS[statKey]} Record Holder`;
  const existing = guild.roles.cache.find((role) => role.name === roleName);
  if (existing) {
    return existing;
  }

  return guild.roles.create({
    name: roleName,
    color: Colors.Gold,
    mentionable: false,
    reason: "Create achievement role for screenshot-verified record holders."
  });
}
