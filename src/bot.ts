import crypto from "node:crypto";
import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Guild,
  Message,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel
} from "discord.js";
import type { AppConfig } from "./config.js";
import { downloadImage, extractStatsFromImage, isSupportedImage, totalStats } from "./ocr.js";
import { buildModeEmbed, buildOverviewEmbed, buildSubmissionEmbed } from "./recordBook.js";
import { DuplicateScreenshotError, hashImage, RecordBookStore } from "./storage.js";
import { GAME_MODE_LABELS, GAME_MODES, type GameMode, type GameResult, type PublishedRecordBook, type RecordEntry } from "./types.js";

const INSTRUCTION_TOPIC =
  "Submit end-of-game NBA 2K screenshots with /submit-record. Records are saved only from screenshot-backed submissions.";

export function createBot(config: AppConfig, store: RecordBookStore): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
  });

  client.once("ready", async () => {
    if (!client.user) {
      return;
    }

    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands(client, config);
  });

  client.on("interactionCreate", async (interaction) => {
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
    } catch (error) {
      console.error(error);
      await safeInteractionReply(interaction, friendlyError(error));
    }
  });

  client.on("messageCreate", async (message) => {
    await handleLooseScreenshotMessage(message, config);
  });

  return client;
}

function commandPayloads() {
  const submitRecord = new SlashCommandBuilder()
    .setName("submit-record")
    .setDescription("Submit an end-of-game screenshot to update crew records.")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Game mode for this record")
        .setRequired(true)
        .addChoices(...GAME_MODES.map((mode) => ({ name: GAME_MODE_LABELS[mode], value: mode })))
    )
    .addStringOption((option) => option.setName("crew").setDescription("Crew/team name").setRequired(true).setMaxLength(60))
    .addStringOption((option) =>
      option
        .setName("result")
        .setDescription("Did your crew win or lose?")
        .setRequired(true)
        .addChoices({ name: "Win", value: "win" }, { name: "Loss", value: "loss" })
    )
    .addAttachmentOption((option) => option.setName("screenshot").setDescription("End-of-game box score screenshot").setRequired(true))
    .addStringOption((option) => option.setName("opponent").setDescription("Opponent crew/team name").setRequired(false).setMaxLength(60))
    .addIntegerOption((option) => option.setName("crew-score").setDescription("Your crew final score").setRequired(false).setMinValue(0).setMaxValue(300))
    .addIntegerOption((option) => option.setName("opponent-score").setDescription("Opponent final score").setRequired(false).setMinValue(0).setMaxValue(300))
    .addStringOption((option) => option.setName("notes").setDescription("Optional context for staff").setRequired(false).setMaxLength(240));

  const recordBook = new SlashCommandBuilder()
    .setName("recordbook")
    .setDescription("Manage the crew record book channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand.setName("setup").setDescription("Create or refresh the Statistics > record-book channel."))
    .addSubcommand((subcommand) => subcommand.setName("refresh").setDescription("Refresh record-book embeds from saved submissions."));

  return [submitRecord.toJSON(), recordBook.toJSON()];
}

async function registerCommands(client: Client, config: AppConfig): Promise<void> {
  const commands = commandPayloads();

  if (config.DISCORD_GUILD_ID) {
    const guild = await client.guilds.fetch(config.DISCORD_GUILD_ID);
    await guild.commands.set(commands);
    console.log(`Registered commands for ${guild.name}`);
    return;
  }

  await Promise.all(client.guilds.cache.map((guild) => guild.commands.set(commands)));
  console.log(`Registered commands for ${client.guilds.cache.size} guild(s)`);
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
  const result = interaction.options.getString("result", true) as GameResult;
  const crewName = interaction.options.getString("crew", true);
  const opponentName = interaction.options.getString("opponent") ?? undefined;
  const crewScore = interaction.options.getInteger("crew-score") ?? undefined;
  const opponentScore = interaction.options.getInteger("opponent-score") ?? undefined;
  const notes = interaction.options.getString("notes") ?? undefined;
  const channel = await ensureRecordBookChannel(interaction.guild, config);
  const teamTotals = totalStats(parsed.playerLines);
  const { playerName: _playerName, teammateGrade: _teammateGrade, ...totals } = teamTotals;

  const entry: RecordEntry = {
    id: crypto.randomUUID(),
    guildId: interaction.guild.id,
    channelId: channel.id,
    submittedById: interaction.user.id,
    submittedByTag: interaction.user.tag,
    submittedAt: new Date().toISOString(),
    mode,
    crewName,
    opponentName,
    result,
    crewScore,
    opponentScore,
    notes,
    screenshotUrl: attachment.url,
    screenshotHash: hashImage(image),
    stats: parsed.playerLines,
    totals,
    ocrText: parsed.rawText
  };

  await store.addEntry(entry);
  await channel.send({ embeds: [buildSubmissionEmbed(entry)] });
  await publishRecordBook(interaction.guild, channel, config, store);

  await interaction.editReply(`Saved ${GAME_MODE_LABELS[mode]} submission for ${crewName}. The record book has been refreshed in ${channel}.`);
}

async function handleLooseScreenshotMessage(message: Message, config: AppConfig): Promise<void> {
  if (message.author.bot || !message.guild || message.channel.type !== ChannelType.GuildText) {
    return;
  }

  if (message.channel.name !== config.RECORD_BOOK_CHANNEL_NAME) {
    return;
  }

  const hasImage = message.attachments.some((attachment) => isSupportedImage(attachment.name, attachment.contentType));
  if (!hasImage) {
    return;
  }

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf2cc60)
        .setTitle("Use /submit-record so the screenshot can be saved")
        .setDescription(
          "I see a screenshot here. To record it, run `/submit-record` with the mode, crew name, result, and this screenshot attached. That keeps the record book accurate and searchable."
        )
    ]
  });
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
    return `That screenshot was already saved for ${error.existingEntry.crewName} on ${new Date(error.existingEntry.submittedAt).toLocaleString()}.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while processing that submission.";
}
