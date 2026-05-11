import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import type { SlashCommand } from "../client.js";
import { createRPSLobby } from "../modules/rps/game.js";
import { gameEmbed } from "../ui/embeds.js";
import { Palette } from "../utils/colors.js";
import { IDS } from "../utils/ids.js";
import { L } from "../utils/locale.js";

export const rpsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("rps")
    .setDescription("ابدأ لعبة حجر ورقة مقص | Start Rock Paper Scissors")
    .setDMPermission(false)
    .addIntegerOption((o) =>
      o
        .setName("rounds")
        .setDescription("عدد الجولات (افتراضي 3) | Number of rounds (default 3)")
        .setMinValue(1)
        .setMaxValue(9)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const rounds = interaction.options.getInteger("rounds") ?? 3;
    const id = randomUUID();
    createRPSLobby({
      id,
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
      hostId: interaction.user.id,
      rounds,
    });
    await interaction.reply({
      content: `<@${interaction.user.id}> فتح لعبة حجر ورقة مقص | opened an RPS game — ${rounds} rounds`,
      embeds: [
        gameEmbed(
          `الجولات: ${rounds} | Rounds: ${rounds}\nاضغط انضمام للعب | Press Join to play`,
          L.rpsTitle,
          Palette.purple
        ),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${IDS.rps.join}:${id}`)
            .setStyle(ButtonStyle.Success)
            .setLabel(L.c4Join)
            .setEmoji("🎮"),
          new ButtonBuilder()
            .setCustomId(`${IDS.rps.cancel}:${id}`)
            .setStyle(ButtonStyle.Danger)
            .setLabel(L.c4Cancel)
            .setEmoji("✖️")
        ),
      ],
    });
  },
};
