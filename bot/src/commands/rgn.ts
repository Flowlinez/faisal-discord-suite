import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../client.js";
import { buildEmbed, errorEmbed, successEmbed } from "../ui/embeds.js";
import { regionSelectRow } from "../ui/components.js";
import { Palette } from "../utils/colors.js";
import { L } from "../utils/locale.js";
import { getGuildSettings } from "../db/settings.js";

export const rgnCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("rgn")
    .setDescription("تبديل الريجون بسرعة | Quick region switch")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString())
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName("region")
        .setDescription("اسم الريجون مباشرة (اختياري) | Region name (optional)")
        .setRequired(false)
        .addChoices(
          { name: "🌐 تلقائي | Automatic", value: "automatic" },
          { name: "🇳🇱 Rotterdam", value: "rotterdam" },
          { name: "🇩🇪 Frankfurt", value: "frankfurt" },
          { name: "🇳🇱 Amsterdam", value: "amsterdam" },
          { name: "🇸🇪 Stockholm", value: "stockholm" },
          { name: "🇬🇧 London", value: "london" },
          { name: "🇺🇸 US East", value: "us-east" },
          { name: "🇺🇸 US Central", value: "us-central" },
          { name: "🇺🇸 US West", value: "us-west" },
          { name: "🇺🇸 US South", value: "us-south" },
          { name: "🇦🇪 Dubai", value: "dubai" },
          { name: "🇮🇳 India", value: "india" },
          { name: "🇸🇬 Singapore", value: "singapore" },
          { name: "🇯🇵 Japan", value: "japan" },
          { name: "🇦🇺 Sydney", value: "sydney" },
          { name: "🇧🇷 Brazil", value: "brazil" },
          { name: "🇿🇦 South Africa", value: "south-africa" }
        )
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const region = interaction.options.getString("region");

    if (!region) {
      // Show select menu for easy picking
      const settings = getGuildSettings(interaction.guild.id);
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const currentChannel = member.voice.channel;
      const currentRegion = currentChannel?.rtcRegion ?? settings.target_region ?? "Automatic";

      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "🌍 تبديل الريجون | Region Switch",
            description: `${L.rgnCurrent(currentRegion)}\n\nاختر الريجون الجديد من القائمة | Select new region below`,
            color: Palette.info,
          }),
        ],
        components: [regionSelectRow()],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Direct region switch
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const channel = member.voice.channel;
    const settings = getGuildSettings(interaction.guild.id);
    const targetChannel = channel ?? (settings.pin_channel_id ? interaction.guild.channels.cache.get(settings.pin_channel_id) : null);

    if (!targetChannel || !targetChannel.isVoiceBased()) {
      await interaction.editReply({
        embeds: [errorEmbed("ادخل روم صوتي أو حدد روم تثبيت | Join a voice channel or set a pin channel.")],
      });
      return;
    }

    const before = targetChannel.rtcRegion ?? "automatic";
    const targetRegion = region === "automatic" ? null : region;

    try {
      await targetChannel.setRTCRegion(targetRegion, "manual rgn command");
      await interaction.editReply({
        embeds: [successEmbed(L.rgnSwitched(before, region))],
      });
    } catch {
      await interaction.editReply({
        embeds: [errorEmbed(L.rgnFailed)],
      });
    }
  },
};
