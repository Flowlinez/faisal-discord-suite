// Rich, modern palette with neon accents.
// Used for embeds, canvas backgrounds, button colors.

export const Palette = {
  // ── Embed Colors (Discord requires integer) ─────────────
  primary: 0x5865f2,    // Discord blurple
  accent: 0x3b82f6,     // Bright blue
  success: 0x22c55e,    // Vivid green
  warn: 0xf59e0b,       // Amber
  danger: 0xef4444,     // Red
  neutral: 0x6b7280,    // Gray
  info: 0x06b6d4,       // Cyan
  purple: 0xa855f7,     // Purple for games
  pink: 0xec4899,       // Pink for special events
  gold: 0xeab308,       // Gold for leaderboard

  // ── Canvas Colors (hex strings) ─────────────────────────
  bg: "#0f1923",
  bgSoft: "#1a2634",
  glass: "rgba(255, 255, 255, 0.08)",
  glassEdge: "rgba(255, 255, 255, 0.15)",
  glassShadow: "rgba(0, 0, 0, 0.35)",
  text: "#e2e8f0",
  textSoft: "#94a3b8",
  textMuted: "#64748b",
  blueX: "#3b82f6",
  redO: "#ef4444",
  yellowC4: "#eab308",
  winLine: "rgba(34, 197, 94, 0.85)",
  speaking: "#22c55e",
  cameraOn: "#3b82f6",
  shareOn: "#a855f7",
  muted: "#ef4444",

  // ── Region Status Colors ────────────────────────────────
  regionGood: 0x22c55e,
  regionBad: 0xef4444,
  regionSwitching: 0xf59e0b,
} as const;
