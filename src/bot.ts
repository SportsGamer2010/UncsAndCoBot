import crypto from "node:crypto";
import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Guild,
  GuildMember,
  Message,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel
} from "discord.js";
import { syncAchievementRoles } from "./achievements.js";
import type { AppConfig } from "./config.js";
import { attachDiscordMembers } from "./members.js";
import { downloadImage, extractStatsFromImage, isSupportedImage, totalStats } from "./ocr.js";
import { buildModeEmbed, buildOverviewEmbed, buildRecordAnnouncementEmbed, buildSubmissionEmbed } from "./recordBook.js";
import { detectNewRecords } from "./records.js";
import { DuplicateScreenshotError, hashImage, RecordBookStore } from "./storage.js";
import { GAME_MODE_LABELS, GAME_MODES, PLAYER_RECORD_CLAIMS, RECORD_STAT_LABELS, type GameMode, type PublishedRecordBook, type RecordClaim, type RecordEntry, type RecordScope } from "./types.js";

const INSTRUCTION_TOPIC =
  "Submit end-of-game NBA 2K screenshots with /submit-record. Records are saved only from screenshot-backed submissions.";

export function createBot(config: AppConfig, store: RecordBookStore): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.once("ready", async () => {
    if (!client.user) {
      return;
    }

    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot is currently in ${client.guilds.cache.size} guild(s): ${client.guilds.cache.map((guild) => `${guild.name} (${guild.id})`).join(", ") || "none"}`);
    await registerCommands(client, config).catch((error) => {
      console.error("Failed to register slash commands on startup:", error);
    });
  });

  client.on("guildCreate", async (guild) => {
    if (config.DISCORD_GUILD_ID && guild.id !== config.DISCORD_GUILD_ID) {
      return;
    }

    await registerGuildCommands(guild, commandPayloads()).catch((error) => {
      console.error(`Failed to register slash commands after joining ${guild.name}:`, error);
    });
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    try {
      if (interaction.commandName === "recordbook") {
        await handleRecordBookCommand(interaction, config, store);
      }

      if (interaction.commandName === "submit-record") {
        await handleSubmitRecord(interaction, config, store);
      }

      if (interaction.commandName === "records") {
        await handleRecordsCommand(interaction, config, store);
      }
    } catch (error) {
      console.error(error);
      await safeInteractionReply(interaction, friendlyError(error));
    }
  });

  return client;
}

function commandPayloads() {
  const submitRecord = new SlashCommandBuilder()
    .setName("submit-record")
    .setDescription("Submit an end-of-game screenshot to update player records.")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Game mode for this record")
        .setRequired(true)
        .addChoices(...GAME_MODES.map((mode) => ({ name: GAME_MODE_LABELS[mode], value: mode })))
    )
    .addStringOption((option) =>
      option
        .setName("record")
        .setDescription("Which player record was set?")
        .setRequired(true)
        .addChoices(...recordClaimChoices())
    )
    .addAttachmentOption((option) => option.setName("screenshot").setDescription("End-of-game box score screenshot").setRequired(true))
    .addStringOption((option) => option.setName("record-holder").setDescription("Search and select the Discord member who set the record").setRequired(true).setAutocomplete(true));

  const records = new SlashCommandBuilder()
    .setName("records")
    .setDescription("View saved player records.")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Game mode to view")
        .setRequired(false)
        .addChoices(...GAME_MODES.map((mode) => ({ name: GAME_MODE_LABELS[mode], value: mode })))
    );

  const recordBook = new SlashCommandBuilder()
    .setName("recordbook")
    .setDescription("Manage the player record book channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand.setName("setup").setDescription("Create or refresh the Statistics > record-book channel."))
    .addSubcommand((subcommand) => subcommand.setName("refresh").setDescription("Refresh record-book embeds from saved submissions."));

  return [submitRecord.toJSON(), records.toJSON(), recordBook.toJSON()];
}

function recordClaimChoices(): { name: string; value: RecordClaim }[] {
  const statChoices = PLAYER_RECORD_CLAIMS.filter((claim) => claim !== "not_sure").map((claim) => {
    const [scope, statKey] = claim.split("_") as [RecordScope, keyof typeof RECORD_STAT_LABELS];
    return {
      name: `${scope === "team" ? "Team" : "Player"} ${RECORD_STAT_LABELS[statKey]}`,
      value: claim
    };
  });

  return [...statChoices, { name: "Not sure - let the bot check", value: "not_sure" }];
}

async function registerCommands(client: Client, config: AppConfig): Promise<void> {
  const commands = commandPayloads();

  if (config.DISCORD_GUILD_ID) {
    console.log(`Registering guild slash commands for configured guild ${config.DISCORD_GUILD_ID}`);
    const guild = await client.guilds.fetch(config.DISCORD_GUILD_ID);
    await registerGuildCommands(guild, commands);
    await registerGlobalCommands(client, commands);
    return;
  }

  await Promise.all(client.guilds.cache.map((guild) => registerGuildCommands(guild, commands)));
  await registerGlobalCommands(client, commands);
  console.log(`Registered commands for ${client.guilds.cache.size} guild(s)`);
}

async function registerGuildCommands(guild: Guild, commands: ReturnType<typeof commandPayloads>): Promise<void> {
  await guild.commands.set(commands);
  console.log(`Registered commands for ${guild.name} (${guild.id})`);
}

async function registerGlobalCommands(client: Client, commands: ReturnType<typeof commandPayloads>): Promise<void> {
  if (!client.application) {
    console.warn("Skipping global command registration because client.application is unavailable.");
    return;
  }

  await client.application.commands.set(commands);
  console.log("Registered global fallback slash commands. Discord can take up to one hour to show global commands.");
}

async function handleRecordBookCommand(interaction: ChatInputCommandInteraction, config: AppConfig, store: RecordBookStore): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Record book commands must be used inside a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const channel = await ensureRecordBookChannel(interaction.guild, config);
  await publishRecordBook(interaction.guild, channel, config, store);

  await interaction.editReply(`Record book is ready in ${channel}. Players should use /submit-record there with an end-of-game screenshot.`);
}

async function handleSubmitRecord(interaction: ChatInputCommandInteraction, config: AppConfig, store: RecordBookStore): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Submissions must be made inside a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const attachment = interaction.options.getAttachment("screenshot", true);
  if (!isSupportedImage(attachment.name, attachment.contentType)) {
    throw new Error("Please attach a PNG, JPG, JPEG, or WebP end-of-game screenshot.");
  }

  const image = await downloadImage(attachment.url, config.MAX_IMAGE_BYTES);
  const parsed = await extractStatsFromImage(image, config.OCR_LANGUAGE);
  if (parsed.playerLines.length === 0) {
    throw new Error("I could not read any player stat rows from that screenshot. Please submit a clearer end-of-game box score image.");
  }

  const mode = interaction.options.getString("mode", true) as GameMode;
  const claimedRecord = interaction.options.getString("record", true) as RecordClaim;
  const claimedRecordHolderId = interaction.options.getString("record-holder", true);
  const claimedRecordHolderMember = await interaction.guild.members.fetch(claimedRecordHolderId).catch(() => undefined);
  if (!claimedRecordHolderMember) {
    throw new Error("I could not find that record holder in this Discord server. Use the record-holder search dropdown and select a member.");
  }
  const channel = await ensureRecordBookChannel(interaction.guild, config);
  const playerLines = await attachDiscordMembers(interaction.guild, parsed.playerLines, claimedRecordHolderMember.user);
  const teamTotals = totalStats(playerLines);
  const { playerName: _playerName, teammateGrade: _teammateGrade, ...totals } = teamTotals;
  const priorModeEntries = await store.entriesForMode(interaction.guild.id, mode);

  const entryBase: Omit<RecordEntry, "detectedRecords"> = {
    id: crypto.randomUUID(),
    guildId: interaction.guild.id,
    channelId: channel.id,
    submittedById: interaction.user.id,
    submittedByTag: interaction.user.tag,
    submittedAt: new Date().toISOString(),
    mode,
    claimedRecord,
    claimedRecordHolderId: claimedRecordHolderMember.id,
    claimedRecordHolderTag: claimedRecordHolderMember.displayName,
    screenshotUrl: attachment.url,
    screenshotHash: hashImage(image),
    stats: playerLines,
    totals,
    ocrText: parsed.rawText
  };
  const entry: RecordEntry = {
    ...entryBase,
    detectedRecords: detectNewRecords(priorModeEntries, entryBase)
  };

  await store.addEntry(entry);
  await syncAchievementRoles(interaction.guild, entry).catch((error) => {
    console.error("Failed to sync achievement roles:", error);
  });
  await channel.send({ embeds: [buildSubmissionEmbed(entry)] });
  if (entry.detectedRecords.length > 0) {
    await channel.send({ content: "New player record set.", embeds: [buildRecordAnnouncementEmbed(entry)] });
  }
  await publishRecordBook(interaction.guild, channel, config, store);

  await interaction.editReply(`Saved ${GAME_MODE_LABELS[mode]} player-record submission for <@${claimedRecordHolderMember.id}>. The record book has been refreshed in ${channel}.`);
}

async function handleAutocomplete(interaction: { commandName: string; guild: Guild | null; options: { getFocused(): string | number }; respond(choices: { name: string; value: string }[]): Promise<void> }): Promise<void> {
  if (interaction.commandName !== "submit-record" || !interaction.guild) {
    await interaction.respond([]);
    return;
  }

  const focused = String(interaction.options.getFocused() ?? "").trim();
  const members = await searchMembers(interaction.guild, focused);
  await interaction.respond(members.map(formatMemberChoice));
}

async function searchMembers(guild: Guild, query: string): Promise<GuildMember[]> {
  if (query.length > 0) {
    const searched = await guild.members.search({ query, limit: 25 }).catch((error) => {
      console.warn("Discord member autocomplete search failed; falling back to cached members.", error);
      return undefined;
    });

    if (searched) {
      return [...searched.values()].filter((member) => !member.user.bot);
    }
  }

  return guild.members.cache.filter((member) => !member.user.bot).first(25);
}

function formatMemberChoice(member: GuildMember): { name: string; value: string } {
  const username = member.user.discriminator === "0" ? member.user.username : member.user.tag;
  const label = member.displayName === member.user.username ? username : `${member.displayName} (${username})`;
  return {
    name: label.slice(0, 100),
    value: member.id
  };
}

async function handleRecordsCommand(interaction: ChatInputCommandInteraction, config: AppConfig, store: RecordBookStore): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Records can only be viewed inside a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const data = await store.read();
  const guildEntries = data.entries.filter((entry) => entry.guildId === interaction.guild?.id);
  const mode = interaction.options.getString("mode") as GameMode | null;
  const embeds = mode ? [buildModeEmbed(mode, guildEntries, config.RECORDS_PER_MODE)] : GAME_MODES.map((gameMode) => buildModeEmbed(gameMode, guildEntries, config.RECORDS_PER_MODE));

  await interaction.editReply({ embeds });
}

async function ensureRecordBookChannel(guild: Guild, config: AppConfig): Promise<TextChannel> {
  const category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === config.STATISTICS_CATEGORY_NAME.toLowerCase());

  const statisticsCategory =
    category ??
    (await guild.channels.create({
      name: config.STATISTICS_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      reason: "Create statistics category for the crew record book."
    }));

  const existing = guild.channels.cache.find(
    (channel): channel is TextChannel => channel.type === ChannelType.GuildText && channel.name.toLowerCase() === config.RECORD_BOOK_CHANNEL_NAME.toLowerCase()
  );

  if (existing) {
    await existing.edit({
      parent: statisticsCategory.id,
      topic: INSTRUCTION_TOPIC,
      reason: "Refresh record book channel placement and instructions."
    });
    return existing;
  }

  return guild.channels.create({
    name: config.RECORD_BOOK_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: statisticsCategory.id,
    topic: INSTRUCTION_TOPIC,
    reason: "Create record book channel for screenshot-backed crew records."
  });
}

async function publishRecordBook(guild: Guild, channel: TextChannel, config: AppConfig, store: RecordBookStore): Promise<void> {
  const data = await store.read();
  const current = data.published[guild.id] ?? { channelId: channel.id, modeMessageIds: {} };
  const published: PublishedRecordBook = { channelId: channel.id, modeMessageIds: { ...current.modeMessageIds } };

  const overviewMessage = await upsertEmbed(channel, current.overviewMessageId, buildOverviewEmbed(channel.name));
  published.overviewMessageId = overviewMessage.id;
  await overviewMessage.pin("Keep record book submission instructions visible.").catch(() => undefined);

  for (const mode of GAME_MODES) {
    const embed = buildModeEmbed(mode, data.entries.filter((entry) => entry.guildId === guild.id), config.RECORDS_PER_MODE);
    const message = await upsertEmbed(channel, current.modeMessageIds[mode], embed);
    published.modeMessageIds[mode] = message.id;
  }

  await store.setPublished(guild.id, published);
}

async function upsertEmbed(channel: TextChannel, messageId: string | undefined, embed: EmbedBuilder): Promise<Message> {
  if (messageId) {
    const existing = await channel.messages.fetch(messageId).catch(() => undefined);
    if (existing) {
      return existing.edit({ embeds: [embed] });
    }
  }

  return channel.send({ embeds: [embed] });
}

async function safeInteractionReply(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(content).catch(() => undefined);
    return;
  }

  await interaction.reply({ content, ephemeral: true }).catch(() => undefined);
}

function friendlyError(error: unknown): string {
  if (error instanceof DuplicateScreenshotError) {
    const holder = error.existingEntry.claimedRecordHolderTag ?? error.existingEntry.crewName ?? "another submission";
    return `That screenshot was already saved for ${holder} on ${new Date(error.existingEntry.submittedAt).toLocaleString()}.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while processing that submission.";
}
