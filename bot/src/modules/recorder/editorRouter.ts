import path from "node:path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Interaction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { IDS, parseId } from "../../utils/ids.js";
import { getClip, updateClip } from "./clipsStore.js";
import { renderRecording } from "./renderer.js";
import { getGuildSettings } from "../../db/settings.js";
import { logger } from "../../utils/logger.js";
import { errorEmbed, successEmbed } from "../../ui/embeds.js";
import { L } from "../../utils/locale.js";

const log = logger.child({ mod: "editor" });

export function editorPanel(clipId: string): ReturnType<typeof rows> {
  return rows(clipId);
}

function rows(clipId: string) {
  const clip = getClip(clipId);
  const users = clip?.users ?? [];
  const userSelect = new StringSelectMenuBuilder()
    .setCustomId(`${IDS.editor.userToggle}:${clipId}`)
    .setPlaceholder(L.edMuteSelect)
    .setMinValues(0)
    .setMaxValues(Math.max(1, Math.min(users.length, 25)))
    .addOptions(
      ...users.slice(0, 25).map((u) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(u.username.slice(0, 80))
          .setValue(u.userId)
      )
    );
  const actionsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${IDS.editor.trimStart}:${clipId}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel(L.edTrimStart),
    new ButtonBuilder()
      .setCustomId(`${IDS.editor.trimEnd}:${clipId}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel(L.edTrimEnd),
    new ButtonBuilder()
      .setCustomId(`${IDS.editor.userVolume}:${clipId}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel(L.edUserVolume),
    new ButtonBuilder()
      .setCustomId(`${IDS.editor.shareVolume}:${clipId}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel(L.edShareVolume),
    new ButtonBuilder()
      .setCustomId(`${IDS.editor.render}:${clipId}`)
      .setStyle(ButtonStyle.Success)
      .setLabel(L.edRender)
  );

  if (users.length === 0) {
    return [actionsRow];
  }
  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(userSelect);
  return [selectRow, actionsRow];
}

// In-memory editor state per clip
interface EditState {
  mutedUserIds: Set<string>;
  userVolumes: Map<string, number>;
  shareVolume: number;
  trimStartSec: number;
  trimEndSec: number;
}
const editStates = new Map<string, EditState>();

function ensureState(clipId: string): EditState {
  let s = editStates.get(clipId);
  if (s) return s;
  s = {
    mutedUserIds: new Set(),
    userVolumes: new Map(),
    shareVolume: 1,
    trimStartSec: 0,
    trimEndSec: 0,
  };
  editStates.set(clipId, s);
  return s;
}

export async function editorRouter(interaction: Interaction): Promise<void> {
  if (
    !interaction.isButton() &&
    !interaction.isStringSelectMenu() &&
    !interaction.isModalSubmit()
  )
    return;
  const id = "customId" in interaction ? interaction.customId : "";
  const { action, args } = parseId(id);
  const clipId = args[0];
  if (!clipId) return;
  const clip = getClip(clipId);
  if (!clip) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        embeds: [errorEmbed(L.edClipNotFound)],
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }
  const state = ensureState(clipId);

  switch (action) {
    case "user_toggle":
      if (!interaction.isStringSelectMenu()) return;
      return userToggle(interaction, clipId, state);
    case "trim_start":
      if (!interaction.isButton()) return;
      return showTrimModal(interaction, clipId, "start");
    case "trim_end":
      if (!interaction.isButton()) return;
      return showTrimModal(interaction, clipId, "end");
    case "user_volume":
      if (!interaction.isButton()) return;
      return showVolumeModal(interaction, clipId);
    case "share_volume":
      if (!interaction.isButton()) return;
      return showShareVolumeModal(interaction, clipId);
    case "render":
      if (!interaction.isButton()) return;
      return renderEdited(interaction, clipId, state);
    default:
      // Modal submissions
      if (interaction.isModalSubmit()) {
        const sub = (id.split(":")[1] ?? "").split("|");
        return handleModalSubmit(interaction, clipId, sub, state);
      }
  }
}

async function userToggle(
  interaction: StringSelectMenuInteraction,
  clipId: string,
  state: EditState
): Promise<void> {
  const selected = new Set(interaction.values);
  state.mutedUserIds = selected;
  await interaction.reply({
    embeds: [
      successEmbed(
        selected.size === 0
          ? "لا أحد مكتوم | No one muted"
          : `${selected.size} شخص مكتوم | ${selected.size} user(s) muted`
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
  void clipId;
}

async function showTrimModal(
  interaction: ButtonInteraction,
  clipId: string,
  kind: "start" | "end"
): Promise<void> {
  const customId = `edit:${kind === "start" ? "trim_start" : "trim_end"}:${clipId}|modal`;
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(kind === "start" ? L.edTrimStart : L.edTrimEnd)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("seconds")
          .setLabel("عدد الثواني | Seconds")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("مثال: 15")
      )
    );
  await interaction.showModal(modal);
}

async function showVolumeModal(
  interaction: ButtonInteraction,
  clipId: string
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`edit:user_volume:${clipId}|modal`)
    .setTitle(L.edUserVolume)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("user_id")
          .setLabel("معرّف الشخص | User ID")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("volume")
          .setLabel("النسبة | Volume (0.0 - 2.0)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("1.0")
      )
    );
  await interaction.showModal(modal);
}

async function showShareVolumeModal(
  interaction: ButtonInteraction,
  clipId: string
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`edit:share_volume:${clipId}|modal`)
    .setTitle(L.edShareVolume)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("volume")
          .setLabel("النسبة | Volume (0.0 - 2.0)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("1.0")
      )
    );
  await interaction.showModal(modal);
}

async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
  clipId: string,
  sub: string[],
  state: EditState
): Promise<void> {
  // customId format: "edit:<action>:<clipId>|modal"
  const action = parseId(interaction.customId).action;
  if (action === "trim_start") {
    const v = Number(interaction.fields.getTextInputValue("seconds"));
    if (Number.isFinite(v) && v >= 0) state.trimStartSec = v;
  } else if (action === "trim_end") {
    const v = Number(interaction.fields.getTextInputValue("seconds"));
    if (Number.isFinite(v) && v >= 0) state.trimEndSec = v;
  } else if (action === "user_volume") {
    const userId = interaction.fields.getTextInputValue("user_id").trim();
    const v = Number(interaction.fields.getTextInputValue("volume"));
    if (userId && Number.isFinite(v) && v >= 0 && v <= 3)
      state.userVolumes.set(userId, v);
  } else if (action === "share_volume") {
    const v = Number(interaction.fields.getTextInputValue("volume"));
    if (Number.isFinite(v) && v >= 0 && v <= 3) state.shareVolume = v;
  }
  await interaction.reply({
    embeds: [successEmbed(L.edUpdated)],
    flags: MessageFlags.Ephemeral,
  });
  void sub;
  void clipId;
}

async function renderEdited(
  interaction: ButtonInteraction,
  clipId: string,
  state: EditState
): Promise<void> {
  const clip = getClip(clipId);
  if (!clip || !interaction.guild) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const settings = getGuildSettings(interaction.guild.id);
  const outDir = path.join(clip.sliceDir, `edit-${Date.now()}`);
  const outFile = path.join(outDir, "edited.mp4");

  const perUser: Record<string, { mute?: boolean; volume?: number }> = {};
  for (const uid of state.mutedUserIds) perUser[uid] = { mute: true };
  for (const [uid, vol] of state.userVolumes) {
    perUser[uid] = { ...(perUser[uid] ?? {}), volume: vol };
  }

  // Adjust duration / events for trim
  const newDuration = Math.max(
    1,
    clip.durationSec - (state.trimStartSec ?? 0) - (state.trimEndSec ?? 0)
  );
  const shiftMs = (state.trimStartSec ?? 0) * 1000;
  const endMs = clip.durationSec * 1000 - (state.trimEndSec ?? 0) * 1000;
  const events = clip.events
    .filter((e) => e.ts >= shiftMs && e.ts <= endMs)
    .map((e) => ({ ...e, ts: e.ts - shiftMs }));
  const chat = clip.chat
    .filter((m) => m.ts >= shiftMs && m.ts <= endMs)
    .map((m) => ({ ...m, ts: m.ts - shiftMs }));

  try {
    await renderRecording({
      outDir,
      outFile,
      durationSec: newDuration,
      users: clip.users, // for trim, ffmpeg-side trimming would be better. For first version we just clip duration.
      events,
      chat,
      quality: settings.render_quality,
      edit: {
        trimStartSec: state.trimStartSec,
        trimEndSec: state.trimEndSec,
        perUser,
        shareVolume: state.shareVolume,
      },
      title: "نسخة معدّلة | Edited version",
    });
  } catch (err) {
    log.error({ err }, "edit render failed");
    await interaction.editReply({ embeds: [errorEmbed(L.edRenderFailed)] });
    return;
  }

  try {
    const fs = await import("node:fs");
    const stat = fs.statSync(outFile);
    if (stat.size / (1024 * 1024) < 24) {
      await interaction.editReply({
        embeds: [successEmbed(L.edReady)],
        files: [outFile],
      });
    } else {
      await interaction.editReply({
        embeds: [
          successEmbed(
            `${L.recFileTooLarge(parseFloat((stat.size / 1024 / 1024).toFixed(1)))}\n\`${outFile}\``
          ),
        ],
      });
    }
  } catch (err) {
    log.error({ err }, "edit reply failed");
  }
  updateClip(clipId, {}); // touch to persist
}
