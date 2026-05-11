import type { Guild } from "discord.js";
import { getGuildSettings } from "../../db/settings.js";
import { buildEmbed } from "../../ui/embeds.js";
import { setupPanelRows } from "../../ui/components.js";
import { Palette } from "../../utils/colors.js";
import { L } from "../../utils/locale.js";

export async function renderSetupPanel(guild: Guild) {
  const s = getGuildSettings(guild.id);
  const rec = s.record_channel_id ? `<#${s.record_channel_id}>` : "غير محدد | Not set";
  const pin = s.pin_channel_id ? `<#${s.pin_channel_id}>` : "غير محدد | Not set";
  const region = s.target_region ?? "Automatic";

  const embed = buildEmbed({
    title: `⚙️ ${L.setupTitle(guild.name)}`,
    description: L.setupDesc,
    color: Palette.accent,
    fields: [
      {
        name: "📺 القنوات | Channels",
        value: [
          `قناة التسجيل | Recording: ${rec}`,
          `روم التثبيت 24/7 | Pin: ${pin}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🌍 الريجون | Region",
        value: `الافتراضي | Default: \`${region}\`\n${L.autoRegionLabel(!!s.auto_region)}`,
        inline: true,
      },
      {
        name: "📌 التثبيت | Pin",
        value: L.autoPinLabel(!!s.auto_pin),
        inline: true,
      },
      {
        name: "🎞️ كليب / بافر | Clip / Buffer",
        value: [
          `المدة | Duration: **${s.default_duration_minutes}** دقيقة | min`,
          `البافر | Buffer: **${s.max_buffer_minutes}** دقيقة | min`,
          `الجودة | Quality: **${s.render_quality}**`,
        ].join("\n"),
        inline: false,
      },
    ],
    footer: { text: "F · S ✦ Precision" },
  });

  return {
    embeds: [embed],
    components: setupPanelRows({
      recordChannelId: s.record_channel_id,
      pinChannelId: s.pin_channel_id,
      defaultDurationMinutes: s.default_duration_minutes,
      targetRegion: s.target_region,
      autoPin: !!s.auto_pin,
      autoRegion: !!s.auto_region,
    }),
  };
}
