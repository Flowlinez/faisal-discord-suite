import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../client.js";
import { startSoundboardCapture, stopSoundboardCapture } from "../modules/soundboard/recorder.js";
import { errorEmbed, successEmbed } from "../ui/embeds.js";
import { soundboardRecordingPanel } from "../ui/components.js";

export const soundboardCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("soundboard")
    .setDescription("تسجيل ساوند جديد (5 ثوانٍ كحد أقصى)")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("record")
        .setDescription("ابدأ تسجيل ساوند من شخص في الفويس")
        .addUserOption((o) =>
          o.setName("user").setDescription("الشخص المراد تسجيله").setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s.setName("stop").setDescription("إيقاف تسجيل الساوند الحالي")
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand(true);
    if (sub === "record") {
      const target = interaction.options.getUser("user", true);
      // Defer immediately — joining voice channel can take several seconds
      await interaction.deferReply();
      const member = await interaction.guild.members.fetch(target.id);
      const channel = member.voice.channel;
      if (!channel) {
        await interaction.editReply({
          embeds: [errorEmbed("الشخص مو موجود في روم صوتي | User is not in a voice channel.")],
        });
        return;
      }
      try {
        await startSoundboardCapture({
          channel,
          authorId: interaction.user.id,
          targetUserId: target.id,
        });
        await interaction.editReply({
          embeds: [
            successEmbed(
              `بدأ تسجيل ${target.username} لمدة أقصاها 5 ثواني. اضغط إيقاف للحفظ والمعاينة.\nRecording ${target.username} for up to 5 seconds. Press stop to save.`
            ),
          ],
          components: [soundboardRecordingPanel()],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "خطأ غير متوقع | Unexpected error";
        await interaction.editReply({
          embeds: [errorEmbed(msg)],
        });
      }
      return;
    }
    if (sub === "stop") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const res = await stopSoundboardCapture(interaction.guild.id);
      if (!res) {
        await interaction.editReply({ embeds: [errorEmbed("ما فيه تسجيل شغّال.")] });
        return;
      }
      await interaction.editReply({
        embeds: [successEmbed(`جاهز للمعاينة (${(res.durationMs / 1000).toFixed(2)}ث).`)],
      });
      return;
    }
  },
};
