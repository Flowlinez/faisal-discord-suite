import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../client.js";
import { buildEmbed } from "../ui/embeds.js";
import { Palette } from "../utils/colors.js";

export const helpCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("قائمة الأوامر والمميزات | Commands & features guide")
    .setDMPermission(false),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "📖 دليل الاستخدام | User Guide",
          color: Palette.primary,
          fields: [
            {
              name: "⚙️ الإعدادات | Settings",
              value:
                "`/setup` — لوحة الإعدادات الكاملة | Full settings panel\n" +
                "↳ قنوات، ريجون، تثبيت، جودة | channels, region, pin, quality",
            },
            {
              name: "🎙️ التسجيل | Recording",
              value:
                "`/record panel` — لوحة التحكم | Control panel\n" +
                "`/record start` · `/record stop` — تحكم سريع | Quick control\n" +
                "`/record status` — حالة التسجيل | Status\n" +
                "`/clip [minutes]` — اقتطاع من البافر | Clip from buffer",
            },
            {
              name: "🎮 الألعاب | Games",
              value:
                "`/xo [rounds]` — لعبة XO (إكس أو) | Tic-Tac-Toe\n" +
                "`/connect4` — كونكت 4 | Connect Four\n" +
                "`/rps [rounds]` — حجر ورقة مقص | Rock Paper Scissors\n" +
                "`/points` — نقاطك | Your scores\n" +
                "`/points leaderboard:true` — المتصدّرون | Leaderboard",
            },
            {
              name: "🌍 الريجون والصوت | Region & Voice",
              value:
                "`/rgn [region]` — تبديل الريجون بسرعة | Quick region switch\n" +
                "`/voicefix reconnect` — إعادة اتصال | Reconnect\n" +
                "`/voicefix cycle` — تدوير الريجون | Cycle region\n" +
                "`/voicefix status` — حالة الاتصال | Connection status\n" +
                "`/voicefix panel` — لوحة إصلاح | Fix panel",
            },
            {
              name: "🔊 الساوندبورد | Soundboard",
              value:
                "`/soundboard record user:@person` — تسجيل صوت (5ث) | Record (5s)\n" +
                "`/soundboard stop` — إيقاف | Stop",
            },
            {
              name: "👑 VIP (للمالك | Owner)",
              value:
                "`/vip avatar change` · `/vip name change` · `/vip banner change`",
            },
            {
              name: "👤 الـ Companion (للمالك | Owner — Windows)",
              value:
                "`/account status` — حالة | Status\n" +
                "`/account name` · `/account display-name` · `/account bio`\n" +
                "`/account avatar` · `/account banner` · `/account presence`\n" +
                "`/account custom-status` — نص + إيموجي | Text + emoji\n" +
                "`/voice join|leave|mute` — تحكم بالروم | Voice control\n" +
                "`/share start|stop|record-start|record-stop|status` — شير | Share\n" +
                "`/camera on|off` — كاميرا | Camera",
            },
          ],
          footer: { text: "F · S ✦ Precision" },
          timestamp: true,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
