import { db } from "./database.js";

export interface GuildSettings {
  guild_id: string;
  record_channel_id: string | null;
  pin_channel_id: string | null;
  default_duration_minutes: number;
  target_region: string | null;
  auto_pin: number;
  auto_region: number;
  max_buffer_minutes: number;
  render_quality: "low" | "medium" | "high";
}

const DEFAULTS = {
  default_duration_minutes: 5,
  auto_pin: 1,
  auto_region: 1,
  max_buffer_minutes: 30,
  render_quality: "high" as const,
};

export function getGuildSettings(guildId: string): GuildSettings {
  const row = db()
    .prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`)
    .get(guildId) as GuildSettings | undefined;
  if (row) return row;
  db()
    .prepare(
      `INSERT OR IGNORE INTO guild_settings
       (guild_id, default_duration_minutes, auto_pin, auto_region, max_buffer_minutes, render_quality)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      guildId,
      DEFAULTS.default_duration_minutes,
      DEFAULTS.auto_pin,
      DEFAULTS.auto_region,
      DEFAULTS.max_buffer_minutes,
      DEFAULTS.render_quality
    );
  return {
    guild_id: guildId,
    record_channel_id: null,
    pin_channel_id: null,
    target_region: null,
    ...DEFAULTS,
  };
}

export function updateGuildSettings(
  guildId: string,
  patch: Partial<Omit<GuildSettings, "guild_id">>
): GuildSettings {
  getGuildSettings(guildId); // ensure row exists
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) return getGuildSettings(guildId);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => patch[k] ?? null);
  db()
    .prepare(
      `UPDATE guild_settings SET ${setClause}, updated_at = strftime('%s','now') WHERE guild_id = ?`
    )
    .run(...values, guildId);
  return getGuildSettings(guildId);
}
