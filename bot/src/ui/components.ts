import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { IDS } from "../utils/ids.js";
import { L } from "../utils/locale.js";

// ── Recording Panel ────────────────────────────────────────

export function recordPanelRows(
  isRecording: boolean,
  isPaused = false
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  if (isRecording) {
    const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(IDS.record.stop)
        .setStyle(ButtonStyle.Danger)
        .setLabel(L.recStop)
        .setEmoji("⏹️"),
      isPaused
        ? new ButtonBuilder()
            .setCustomId(IDS.record.resume)
            .setStyle(ButtonStyle.Success)
            .setLabel(L.recResume)
            .setEmoji("▶️")
        : new ButtonBuilder()
            .setCustomId(IDS.record.pause)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(L.recPause)
            .setEmoji("⏸️"),
      new ButtonBuilder()
        .setCustomId(IDS.record.openSettings)
        .setStyle(ButtonStyle.Secondary)
        .setLabel(L.recSettings)
        .setEmoji("⚙️")
    );
    const clipRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(IDS.record.clipSelect)
        .setPlaceholder(L.clipSelect)
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("✂️ 1 دقيقة | 1 min").setValue("1").setEmoji("✂️"),
          new StringSelectMenuOptionBuilder().setLabel("✂️ 2 دقيقة | 2 min").setValue("2").setEmoji("✂️"),
          new StringSelectMenuOptionBuilder().setLabel("✂️ 3 دقايق | 3 min").setValue("3").setEmoji("✂️"),
          new StringSelectMenuOptionBuilder().setLabel("✂️ 5 دقايق | 5 min").setValue("5").setEmoji("✂️"),
          new StringSelectMenuOptionBuilder().setLabel("✂️ 10 دقايق | 10 min").setValue("10").setEmoji("✂️"),
          new StringSelectMenuOptionBuilder().setLabel("✂️ 15 دقيقة | 15 min").setValue("15").setEmoji("✂️"),
          new StringSelectMenuOptionBuilder().setLabel("✂️ 30 دقيقة | 30 min").setValue("30").setEmoji("✂️")
        )
    );
    return [controlRow, clipRow];
  }

  const startRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.record.start)
      .setStyle(ButtonStyle.Success)
      .setLabel(L.recStart)
      .setEmoji("🔴"),
    new ButtonBuilder()
      .setCustomId(IDS.record.openSettings)
      .setStyle(ButtonStyle.Secondary)
      .setLabel(L.recSettings)
      .setEmoji("⚙️")
  );
  return [startRow];
}

/** @deprecated Use recordPanelRows instead */
export function recordPanelRow(isRecording: boolean): ActionRowBuilder<ButtonBuilder> {
  return recordPanelRows(isRecording)[0] as ActionRowBuilder<ButtonBuilder>;
}

// ── Setup Panel ────────────────────────────────────────────

const REGION_OPTIONS: { label: string; value: string; emoji: string }[] = [
  { label: "🌐 تلقائي | Automatic", value: "automatic", emoji: "🌐" },
  { label: "🇳🇱 Rotterdam", value: "rotterdam", emoji: "🇳🇱" },
  { label: "🇩🇪 Frankfurt", value: "frankfurt", emoji: "🇩🇪" },
  { label: "🇳🇱 Amsterdam", value: "amsterdam", emoji: "🇳🇱" },
  { label: "🇸🇪 Stockholm", value: "stockholm", emoji: "🇸🇪" },
  { label: "🇬🇧 London", value: "london", emoji: "🇬🇧" },
  { label: "🇺🇸 US East", value: "us-east", emoji: "🇺🇸" },
  { label: "🇺🇸 US Central", value: "us-central", emoji: "🇺🇸" },
  { label: "🇺🇸 US West", value: "us-west", emoji: "🇺🇸" },
  { label: "🇺🇸 US South", value: "us-south", emoji: "🇺🇸" },
  { label: "🇦🇪 Dubai", value: "dubai", emoji: "🇦🇪" },
  { label: "🇮🇳 India", value: "india", emoji: "🇮🇳" },
  { label: "🇸🇬 Singapore", value: "singapore", emoji: "🇸🇬" },
  { label: "🇯🇵 Japan", value: "japan", emoji: "🇯🇵" },
  { label: "🇦🇺 Sydney", value: "sydney", emoji: "🇦🇺" },
  { label: "🇧🇷 Brazil", value: "brazil", emoji: "🇧🇷" },
  { label: "🇿🇦 South Africa", value: "south-africa", emoji: "🇿🇦" },
];

export function setupPanelRows(s: {
  recordChannelId: string | null;
  pinChannelId: string | null;
  defaultDurationMinutes: number;
  targetRegion: string | null;
  autoPin: boolean;
  autoRegion: boolean;
  renderQuality?: string;
}): ActionRowBuilder<ChannelSelectMenuBuilder | StringSelectMenuBuilder | ButtonBuilder>[] {
  const recordRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(IDS.setup.selectRecordChannel)
      .setPlaceholder(L.selectRecordChannel)
      .setChannelTypes(ChannelType.GuildText)
      .setMaxValues(1)
  );

  const pinRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(IDS.setup.selectPinChannel)
      .setPlaceholder(L.selectPinChannel)
      .setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
      .setMaxValues(1)
  );

  const durationRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(IDS.setup.selectDefaultDuration)
      .setPlaceholder(L.selectDuration(s.defaultDurationMinutes))
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel("5 دقايق | 5 min").setValue("5").setEmoji("⏱️"),
        new StringSelectMenuOptionBuilder().setLabel("10 دقايق | 10 min").setValue("10").setEmoji("⏱️"),
        new StringSelectMenuOptionBuilder().setLabel("30 دقيقة | 30 min").setValue("30").setEmoji("⏱️")
      )
  );

  const regionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(IDS.setup.selectRegion)
      .setPlaceholder(L.selectRegion(s.targetRegion))
      .addOptions(
        REGION_OPTIONS.map((r) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(r.label)
            .setValue(r.value)
            .setEmoji(r.emoji)
        )
      )
  );

  const togglesRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.setup.toggleAutoPin)
      .setStyle(s.autoPin ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel(L.autoPinLabel(s.autoPin))
      .setEmoji(s.autoPin ? "📌" : "📍"),
    new ButtonBuilder()
      .setCustomId(IDS.setup.toggleAutoRegion)
      .setStyle(s.autoRegion ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel(L.autoRegionLabel(s.autoRegion))
      .setEmoji(s.autoRegion ? "🌍" : "🌑"),
    new ButtonBuilder()
      .setCustomId(IDS.setup.close)
      .setStyle(ButtonStyle.Danger)
      .setLabel(L.closePanel)
      .setEmoji("✖️")
  );

  return [recordRow, pinRow, durationRow, regionRow, togglesRow];
}

// ── Soundboard ─────────────────────────────────────────────

export function soundboardRecordingPanel(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.soundboard.stop)
      .setStyle(ButtonStyle.Danger)
      .setLabel(L.sbStopRec)
      .setEmoji("⏹️")
  );
}

export function soundboardPreviewPanel(draftId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${IDS.soundboard.save}:${draftId}`)
      .setStyle(ButtonStyle.Success)
      .setLabel(L.sbApprove)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`${IDS.soundboard.discard}:${draftId}`)
      .setStyle(ButtonStyle.Danger)
      .setLabel(L.sbDiscard)
      .setEmoji("🗑️")
  );
}

export function soundboardNameModal(draftId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${IDS.soundboard.modal}:${draftId}`)
    .setTitle(L.sbModalTitle)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("sb_name")
          .setLabel(L.sbNameLabel)
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(32)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("sb_emoji")
          .setLabel(L.sbEmojiLabel)
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(8)
      )
    );
}

// ── Editor ─────────────────────────────────────────────────

export function editorRow(_recordingId: string): ActionRowBuilder<ButtonBuilder>[] {
  void _recordingId;
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.editor.trimStart)
      .setStyle(ButtonStyle.Primary)
      .setLabel(L.edTrimStart)
      .setEmoji("⏪"),
    new ButtonBuilder()
      .setCustomId(IDS.editor.trimEnd)
      .setStyle(ButtonStyle.Primary)
      .setLabel(L.edTrimEnd)
      .setEmoji("⏩"),
    new ButtonBuilder()
      .setCustomId(IDS.editor.rename)
      .setStyle(ButtonStyle.Secondary)
      .setLabel(L.edRename)
      .setEmoji("✏️"),
    new ButtonBuilder()
      .setCustomId(IDS.editor.render)
      .setStyle(ButtonStyle.Success)
      .setLabel(L.edRender)
      .setEmoji("🎬")
  );
  return [row1];
}

// ── Region Quick Select ────────────────────────────────────

export function regionSelectRow(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(IDS.rgn.select)
      .setPlaceholder("اختر الريجون | Select Region")
      .addOptions(
        REGION_OPTIONS.map((r) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(r.label)
            .setValue(r.value)
            .setEmoji(r.emoji)
        )
      )
  );
}

// ── Voice Fix ──────────────────────────────────────────────

export function voiceFixRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.voiceFix.reconnect)
      .setStyle(ButtonStyle.Primary)
      .setLabel("إعادة اتصال | Reconnect")
      .setEmoji("🔄"),
    new ButtonBuilder()
      .setCustomId(IDS.voiceFix.cycleRegion)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("تدوير الريجون | Cycle Region")
      .setEmoji("🌍")
  );
}
