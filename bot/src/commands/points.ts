import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../client.js";
import { getLeaderboard, getUserPoints } from "../db/points.js";
import { buildEmbed } from "../ui/embeds.js";
import { Palette } from "../utils/colors.js";

export const pointsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("points")
    .setDescription("عرض نقاطك في الألعاب | View your game scores")
    .setDMPermission(false)
    .addUserOption((o) => o.setName("user").setDescription("شخص معين | Specific user"))
    .addBooleanOption((o) =>
      o.setName("leaderboard").setDescription("عرض المتصدّرين | Show leaderboard")
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const leaderboard = interaction.options.getBoolean("leaderboard") ?? false;
    if (leaderboard) {
      const rows = getLeaderboard(interaction.guild.id, 10);
      const medals = ["🥇", "🥈", "🥉"];
      const lines = await Promise.all(
        rows.map(async (r, i) => {
          const m = await interaction.guild!.members.fetch(r.user_id).catch(() => null);
          const name = m?.displayName ?? `<@${r.user_id}>`;
          const medal = medals[i] ?? `**${i + 1}.**`;
          return `${medal} ${name} — ${r.round_wins} جولة | rounds (${r.match_wins} مباراة | matches)`;
        })
      );
      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "🏆 المتصدّرون | Leaderboard",
            description: lines.length > 0 ? lines.join("\n") : "ما فيه نقاط بعد | No scores yet.",
            color: Palette.gold,
          }),
        ],
      });
      return;
    }

    const target = interaction.options.getUser("user") ?? interaction.user;
    const p = getUserPoints(interaction.guild.id, target.id);
    await interaction.reply({
      embeds: [
        buildEmbed({
          title: `📊 نقاط ${target.username} | ${target.username}'s Scores`,
          thumbnail: target.displayAvatarURL({ size: 128, extension: "png" }),
          fields: [
            { name: "🏅 جولات فائزة | Round Wins", value: `${p.round_wins}`, inline: true },
            { name: "🏆 مباريات فائزة | Match Wins", value: `${p.match_wins}`, inline: true },
            { name: "🤝 تعادلات | Draws", value: `${p.draws}`, inline: true },
            { name: "💔 خسائر | Losses", value: `${p.losses}`, inline: true },
          ],
          color: Palette.accent,
        }),
      ],
    });
  },
};
