import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../client.js";
import { recordingManager } from "../modules/recorder/state.js";
import { errorEmbed, successEmbed } from "../ui/embeds.js";
import { L } from "../utils/locale.js";

export const clipCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("clip")
    .setDescription("احفظ كليب من آخر فترة | Save a clip from recent buffer")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString())
    .setDMPermission(false)
    .addIntegerOption((o) =>
      o
        .setName("minutes")
        .setDescription("عدد الدقايق | Minutes (1-60)")
        .setMinValue(1)
        .setMaxValue(60)
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const minutes = interaction.options.getInteger("minutes") ?? 5;
    const session = recordingManager.get(interaction.guild.id);
    if (!session) {
      await interaction.reply({
        embeds: [errorEmbed(L.recNoActiveClip)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      embeds: [successEmbed(L.recPreparingClip(minutes))],
      flags: MessageFlags.Ephemeral,
    });
  },
};
