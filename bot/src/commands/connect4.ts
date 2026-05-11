import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import type { SlashCommand } from "../client.js";
import { createC4Lobby, c4LobbyRow } from "../modules/connect4/lobby.js";
import { gameEmbed } from "../ui/embeds.js";
import { Palette } from "../utils/colors.js";
import { L } from "../utils/locale.js";

export const connect4Command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("connect4")
    .setDescription("ابدأ لعبة كونكت 4 | Start a Connect 4 game")
    .setDMPermission(false),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const id = randomUUID();
    createC4Lobby({
      id,
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
      hostId: interaction.user.id,
    });
    await interaction.reply({
      content: `<@${interaction.user.id}> فتح لعبة Connect 4 — اضغط انضمام | opened a Connect 4 game — press Join`,
      embeds: [
        gameEmbed(
          "شخصين يقدرون ينضمون | Two players can join.",
          L.c4LobbyOpen,
          Palette.info
        ),
      ],
      components: [c4LobbyRow(id)],
    });
  },
};
