import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import type { SlashCommand } from "../client.js";
import { createLobby, lobbyRow } from "../modules/xo/lobby.js";
import { gameEmbed } from "../ui/embeds.js";
import { Palette } from "../utils/colors.js";
import { L } from "../utils/locale.js";

export const xoCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("xo")
    .setDescription("ابدأ لعبة XO | Start a Tic-Tac-Toe game")
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
    createLobby({
      id,
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
      hostId: interaction.user.id,
      totalRounds: rounds,
    });
    await interaction.reply({
      content: `<@${interaction.user.id}> فتح لعبة XO — اضغط انضمام | opened XO — press Join`,
      embeds: [
        gameEmbed(
          `${L.xoRound(1, rounds)}\nيقدر شخصين ينضمون | Two players can join.`,
          L.xoLobbyOpen,
          Palette.accent
        ),
      ],
      components: [lobbyRow(id)],
    });
  },
};
