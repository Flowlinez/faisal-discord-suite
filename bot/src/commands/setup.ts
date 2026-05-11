import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { SlashCommand } from "../client.js";
import { renderSetupPanel } from "../modules/settings/panel.js";

export const setupCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("لوحة الإعدادات الكاملة | Full settings panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .setDMPermission(false),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const panel = await renderSetupPanel(interaction.guild);
    await interaction.reply({
      ...panel,
      flags: MessageFlags.Ephemeral,
    });
  },
};
