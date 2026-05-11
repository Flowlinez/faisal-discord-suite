import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  getVoiceConnection,
  VoiceConnectionStatus,
  joinVoiceChannel,
  entersState,
} from "@discordjs/voice";
import type { SlashCommand } from "../client.js";
import { buildEmbed, errorEmbed, successEmbed, warnEmbed } from "../ui/embeds.js";
import { voiceFixRow } from "../ui/components.js";
import { Palette } from "../utils/colors.js";
import { L } from "../utils/locale.js";
import { getGuildSettings } from "../db/settings.js";
import { rotateRegion } from "../modules/stayConnected/regionWatcher.js";

export const voicefixCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("voicefix")
    .setDescription("إصلاح مشاكل الصوت والاتصال | Fix voice & connection issues")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString())
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName("reconnect").setDescription("إعادة اتصال البوت بالروم | Reconnect bot to voice")
    )
    .addSubcommand((s) =>
      s.setName("cycle").setDescription("تدوير الريجون لإصلاح الصوت | Cycle region to fix audio")
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("حالة الاتصال الصوتي | Voice connection status")
    )
    .addSubcommand((s) =>
      s.setName("panel").setDescription("لوحة إصلاح سريعة | Quick fix panel with buttons")
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand(true);

    if (sub === "panel") {
      const conn = getVoiceConnection(interaction.guild.id);
      const status = conn?.state.status ?? "disconnected";
      const settings = getGuildSettings(interaction.guild.id);
      const pinChannel = settings.pin_channel_id ? `<#${settings.pin_channel_id}>` : "غير محدد | Not set";

      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "🔧 إصلاح الصوت | Voice Fix",
            description: [
              `**حالة الاتصال | Status:** ${statusEmoji(status)} \`${status}\``,
              `**روم التثبيت | Pin Channel:** ${pinChannel}`,
              `**الريجون التلقائي | Auto-Region:** ${settings.auto_region ? "مفعّل | ON" : "مغلق | OFF"}`,
              "",
              "اضغط الأزرار أدناه لإصلاح المشاكل | Use buttons below to fix issues",
            ].join("\n"),
            color: status === "ready" ? Palette.success : Palette.warn,
          }),
        ],
        components: [voiceFixRow()],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "status") {
      const conn = getVoiceConnection(interaction.guild.id);
      if (!conn) {
        await interaction.reply({
          embeds: [warnEmbed("البوت مو متصل بأي روم صوتي | Bot is not in any voice channel.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const me = interaction.guild.members.me;
      const channelId = me?.voice.channelId;
      const channel = channelId ? interaction.guild.channels.cache.get(channelId) : null;
      const region = channel?.isVoiceBased() ? (channel.rtcRegion ?? "automatic") : "unknown";

      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "📡 حالة الاتصال | Connection Status",
            fields: [
              { name: "الحالة | Status", value: `${statusEmoji(conn.state.status)} \`${conn.state.status}\``, inline: true },
              { name: "الروم | Channel", value: channelId ? `<#${channelId}>` : "—", inline: true },
              { name: "الريجون | Region", value: `\`${region}\``, inline: true },
            ],
            color: conn.state.status === VoiceConnectionStatus.Ready ? Palette.success : Palette.warn,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === "reconnect") {
      const settings = getGuildSettings(interaction.guild.id);
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const channel = member.voice.channel ??
        (settings.pin_channel_id ? interaction.guild.channels.cache.get(settings.pin_channel_id) : null);

      if (!channel || !channel.isVoiceBased()) {
        await interaction.editReply({
          embeds: [errorEmbed("ادخل روم صوتي أو حدد روم تثبيت | Join voice or set pin channel.")],
        });
        return;
      }

      // Destroy existing connection
      const old = getVoiceConnection(interaction.guild.id);
      if (old) {
        try { old.destroy(); } catch { /* ignore */ }
      }

      // Rejoin
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
          embeds: [successEmbed(`${L.voiceReconnected}\n\nالروم | Channel: <#${channel.id}>`)],
        });
      } catch {
        await interaction.editReply({
          embeds: [errorEmbed("فشل إعادة الاتصال — جرب مرة ثانية | Reconnect failed — try again.")],
        });
      }
      return;
    }

    if (sub === "cycle") {
      const settings = getGuildSettings(interaction.guild.id);
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const channel = member.voice.channel ??
        (settings.pin_channel_id ? interaction.guild.channels.cache.get(settings.pin_channel_id) : null);

      if (!channel || !channel.isVoiceBased()) {
        await interaction.editReply({
          embeds: [errorEmbed("ادخل روم صوتي أو حدد روم تثبيت | Join voice or set pin channel.")],
        });
        return;
      }

      await rotateRegion(interaction.guild, channel.id, settings.target_region ?? null);
      const newRegion = (interaction.guild.channels.cache.get(channel.id) as { rtcRegion?: string | null } | undefined)?.rtcRegion ?? "automatic";
      await interaction.editReply({
        embeds: [successEmbed(`${L.voiceFixApplied}\n\nالريجون الجديد | New Region: \`${newRegion}\``)],
      });
      return;
    }
  },
};

function statusEmoji(status: string): string {
  switch (status) {
    case "ready": return "🟢";
    case "connecting": return "🟡";
    case "signalling": return "🟡";
    case "disconnected": return "🔴";
    case "destroyed": return "⚫";
    default: return "⚪";
  }
}
