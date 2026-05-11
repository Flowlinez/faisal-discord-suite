import {
  type Interaction,
  type StringSelectMenuInteraction,
  MessageFlags,
} from "discord.js";
import { logger } from "../utils/logger.js";
import { L } from "../utils/locale.js";
import { parseId } from "../utils/ids.js";

import { setupRouter } from "../modules/settings/router.js";
import { recordRouter } from "../modules/recorder/router.js";
import { xoRouter } from "../modules/xo/router.js";
import { c4Router } from "../modules/connect4/router.js";
import { rpsRouter } from "../modules/rps/router.js";
import { soundboardRouter } from "../modules/soundboard/router.js";
import { editorRouter } from "../modules/recorder/editorRouter.js";
import { successEmbed, errorEmbed } from "../ui/embeds.js";
import { getGuildSettings } from "../db/settings.js";
import { L as Loc } from "../utils/locale.js";

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.client.commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }

    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isChannelSelectMenu() ||
      interaction.isUserSelectMenu() ||
      interaction.isRoleSelectMenu() ||
      interaction.isModalSubmit()
    ) {
      const id = "customId" in interaction ? interaction.customId : "";
      const { ns } = parseId(id);
      switch (ns) {
        case "setup":
          return setupRouter(interaction);
        case "rec":
          return recordRouter(interaction);
        case "edit":
          return editorRouter(interaction);
        case "xo":
          return xoRouter(interaction);
        case "c4":
          return c4Router(interaction);
        case "rps":
          return rpsRouter(interaction);
        case "sb":
          return soundboardRouter(interaction);
        case "rgn":
          return rgnSelectHandler(interaction as StringSelectMenuInteraction);
        case "vfix":
          return voiceFixHandler(interaction);
        default:
          logger.debug({ id }, "unmatched interaction");
          return;
      }
    }
  } catch (err) {
    logger.error({ err }, "interaction error");
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: L.unknownError, flags: MessageFlags.Ephemeral });
      } catch {
        /* ignore */
      }
    }
  }
}

async function rgnSelectHandler(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu() || !interaction.guild) return;
  const region = interaction.values[0];
  if (!region) return;

  await interaction.deferUpdate();
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const settings = getGuildSettings(interaction.guild.id);
  const channel = member.voice.channel ??
    (settings.pin_channel_id ? interaction.guild.channels.cache.get(settings.pin_channel_id) : null);

  if (!channel || !channel.isVoiceBased()) {
    await interaction.followUp({
      embeds: [errorEmbed("ادخل روم صوتي | Join a voice channel first.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const before = channel.rtcRegion ?? "automatic";
  const target = region === "automatic" ? null : region;

  try {
    await channel.setRTCRegion(target, "rgn select menu");
    await interaction.followUp({
      embeds: [successEmbed(Loc.rgnSwitched(before, region))],
      flags: MessageFlags.Ephemeral,
    });
  } catch {
    await interaction.followUp({
      embeds: [errorEmbed(Loc.rgnFailed)],
      flags: MessageFlags.Ephemeral,
    });
  }
}

import {
  getVoiceConnection,
  VoiceConnectionStatus,
  joinVoiceChannel,
  entersState,
} from "@discordjs/voice";
import { rotateRegion } from "../modules/stayConnected/regionWatcher.js";

async function voiceFixHandler(interaction: Interaction): Promise<void> {
  if (!interaction.isButton() || !interaction.guild) return;
  const { action } = parseId(interaction.customId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const settings = getGuildSettings(interaction.guild.id);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const channel = member.voice.channel ??
    (settings.pin_channel_id ? interaction.guild.channels.cache.get(settings.pin_channel_id) : null);

  if (!channel || !channel.isVoiceBased()) {
    await interaction.editReply({
      embeds: [errorEmbed("ادخل روم صوتي | Join a voice channel.")],
    });
    return;
  }

  if (action === "reconnect") {
    const old = getVoiceConnection(interaction.guild.id);
    if (old) { try { old.destroy(); } catch { /* ignore */ } }

    const conn = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });

    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 10_000);
      await interaction.editReply({
        embeds: [successEmbed(Loc.voiceReconnected)],
      });
    } catch {
      await interaction.editReply({
        embeds: [errorEmbed("فشل إعادة الاتصال | Reconnect failed.")],
      });
    }
  } else if (action === "cycle_region") {
    await rotateRegion(interaction.guild, channel.id, settings.target_region ?? null);
    await interaction.editReply({
      embeds: [successEmbed(Loc.voiceFixApplied)],
    });
  }
}
