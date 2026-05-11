import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../client.js";
import { recordingManager } from "../modules/recorder/state.js";
import { recordPanelRow } from "../ui/components.js";
import { buildEmbed, errorEmbed, successEmbed } from "../ui/embeds.js";
import { getGuildSettings } from "../db/settings.js";
import { Palette } from "../utils/colors.js";
import { L } from "../utils/locale.js";

export const recordCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("record")
    .setDescription("إدارة التسجيل الصوتي | Manage voice recording")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString())
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName("panel").setDescription("نشر لوحة التحكم | Post control panel")
    )
    .addSubcommand((s) => s.setName("start").setDescription("بدء التسجيل | Start recording"))
    .addSubcommand((s) => s.setName("stop").setDescription("إيقاف التسجيل | Stop recording"))
    .addSubcommand((s) =>
      s.setName("status").setDescription("حالة التسجيل | Recording status")
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand(true);
    const settings = getGuildSettings(interaction.guild.id);

    if (sub === "panel") {
      const isRec = recordingManager.isActive(interaction.guild.id);
      await interaction.reply({
        embeds: [
          buildEmbed({
            title: `🎙️ ${L.recPanel}`,
            description: [
              `**القناة | Channel:** ${settings.pin_channel_id ? `<#${settings.pin_channel_id}>` : "غير محدد | Not set"}`,
              `**المدة | Duration:** ${settings.default_duration_minutes} دقيقة | min`,
              `**البافر | Buffer:** ${settings.max_buffer_minutes} دقيقة | min`,
              `**الجودة | Quality:** ${settings.render_quality}`,
            ].join("\n"),
            color: Palette.accent,
          }),
        ],
        components: [recordPanelRow(isRec)],
      });
      return;
    }

    if (sub === "status") {
      const s = recordingManager.get(interaction.guild.id);
      if (!s) {
        await interaction.reply({
          embeds: [buildEmbed({ description: L.notRecording })],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const secs = Math.floor((Date.now() - s.startedAt) / 1000);
      await interaction.reply({
        embeds: [
          buildEmbed({
            title: `🎙️ ${L.recStatus}`,
            description: [
              `**الروم | Channel:** <#${s.channelId}>`,
              `**المدة | Duration:** ${L.formatDuration(secs)}`,
              `**المشاركون | Participants:** ${s.buffer.listUsers().length}`,
              `**بدأ بواسطة | Started by:** <@${s.startedBy}>`,
            ].join("\n"),
            color: Palette.success,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "start") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const channel = member.voice.channel ??
        (settings.pin_channel_id
          ? interaction.guild.channels.cache.get(settings.pin_channel_id)
          : null);
      if (!channel || !channel.isVoiceBased()) {
        await interaction.reply({
          embeds: [errorEmbed(L.notInVoice)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await recordingManager.start({
          channel,
          startedBy: interaction.user.id,
        });
        await interaction.editReply({
          embeds: [successEmbed(`بدأت التسجيل في <#${channel.id}> | Recording started in <#${channel.id}>.`)],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : L.unknownError;
        await interaction.editReply({ embeds: [errorEmbed(msg)] });
      }
      return;
    }

    if (sub === "stop") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const stopped = await recordingManager.stop(interaction.guild.id);
      if (!stopped) {
        await interaction.editReply({ embeds: [errorEmbed(L.notRecording)] });
        return;
      }
      await interaction.editReply({
        embeds: [
          successEmbed(
            "تم إيقاف التسجيل — استخدم اللوحة لإرسال كليب أو نسخة كاملة\nRecording stopped — use the panel to export a clip or full copy."
          ),
        ],
      });
      return;
    }
  },
};
