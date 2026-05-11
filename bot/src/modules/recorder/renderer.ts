import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import ffmpegPathModule from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { spawn } from "node:child_process";
import { createCanvas, loadImage, GlobalFonts, type Image } from "@napi-rs/canvas";
import { logger } from "../../utils/logger.js";
import { Palette } from "../../utils/colors.js";
import { SAMPLE_RATE, CHANNELS } from "./rollingBuffer.js";
import type { ChatMsg, EditOptions, VoiceEvent } from "./types.js";

const ffmpegPath = ffmpegPathModule as unknown as string | null;
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
const log = logger.child({ mod: "renderer" });

// Try to register an Arabic-capable font if available.
try {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
    "/usr/share/fonts/TTF/NotoSansArabic-Regular.ttf",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      GlobalFonts.registerFromPath(c, "BotUI");
      break;
    }
  }
} catch {
  /* ignore — canvas will fall back */
}

export interface UserAudio {
  userId: string;
  username: string;
  avatarUrl: string;
  pcmFile: string;
  bytesWritten: number;
}

export interface RenderArgs {
  outDir: string;
  outFile: string; // mp4 path
  durationSec: number;
  users: UserAudio[];
  events: VoiceEvent[];
  chat: ChatMsg[];
  quality: "low" | "medium" | "high";
  edit?: EditOptions;
  title?: string;
}

const QUALITY = {
  low: { width: 854, height: 480, fps: 15, audioBitrate: "128k", videoBitrate: "800k" },
  medium: { width: 1280, height: 720, fps: 24, audioBitrate: "160k", videoBitrate: "2000k" },
  high: { width: 1920, height: 1080, fps: 30, audioBitrate: "192k", videoBitrate: "4500k" },
} as const;

// ── Liquid Glass Color Palette ─────────────────────────────

const LG = {
  // macOS-like window chrome
  windowBg: "rgba(28, 28, 30, 0.82)",
  windowBorder: "rgba(255, 255, 255, 0.08)",
  windowShadow: "rgba(0, 0, 0, 0.55)",
  // Traffic lights
  dotClose: "#ff5f57",
  dotMinimize: "#febc2e",
  dotMaximize: "#28c840",
  dotInactive: "rgba(255, 255, 255, 0.12)",
  // Glass panels
  glassBg: "rgba(255, 255, 255, 0.04)",
  glassBorder: "rgba(255, 255, 255, 0.10)",
  glassHighlight: "rgba(255, 255, 255, 0.06)",
  // Card
  cardBg: "rgba(255, 255, 255, 0.06)",
  cardBorder: "rgba(255, 255, 255, 0.09)",
  cardSpeaking: "rgba(88, 101, 242, 0.35)",
  // Text
  textPrimary: "#f5f5f7",
  textSecondary: "#a1a1a6",
  textTertiary: "#6e6e73",
  // Accent
  accent: "#5865f2",
  accentGlow: "rgba(88, 101, 242, 0.30)",
  speakGreen: "#30d158",
  speakGlow: "rgba(48, 209, 88, 0.35)",
  // Chat
  chatBubbleSelf: "rgba(88, 101, 242, 0.20)",
  chatBubbleOther: "rgba(255, 255, 255, 0.06)",
  // Background mesh
  meshA: "#1c1c2e",
  meshB: "#0d0d1a",
  blobA: "rgba(88, 101, 242, 0.08)",
  blobB: "rgba(168, 85, 247, 0.06)",
  blobC: "rgba(48, 209, 88, 0.04)",
} as const;

/**
 * Mix per-user PCM into a single stereo wav file, applying mute/volume.
 * Returns path to the mixed wav file.
 */
async function mixAudio(args: RenderArgs): Promise<string> {
  const { users, edit, outDir, durationSec } = args;
  const mixedPath = path.join(outDir, "mixed.wav");

  if (users.length === 0) {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input("anullsrc=r=48000:cl=stereo")
        .inputOptions(["-f", "lavfi", "-t", String(durationSec)])
        .audioCodec("pcm_s16le")
        .save(mixedPath)
        .on("end", () => resolve())
        .on("error", reject);
    });
    return mixedPath;
  }

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg();
    const filterParts: string[] = [];
    const amixLabels: string[] = [];
    users.forEach((u, idx) => {
      cmd = cmd.input(u.pcmFile).inputOptions([
        "-f", "s16le",
        "-ar", String(SAMPLE_RATE),
        "-ac", String(CHANNELS),
      ]);
      const vol = edit?.perUser?.[u.userId]?.mute
        ? 0
        : edit?.perUser?.[u.userId]?.volume ?? 1;
      filterParts.push(`[${idx}:a]volume=${vol}[a${idx}]`);
      amixLabels.push(`[a${idx}]`);
    });
    const amix = `${amixLabels.join("")}amix=inputs=${users.length}:normalize=0:duration=longest[aout]`;
    cmd
      .complexFilter([...filterParts, amix])
      .outputOptions(["-map", "[aout]"])
      .audioCodec("pcm_s16le")
      .save(mixedPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err));
  });
  return mixedPath;
}

interface UserStatus {
  speaking: boolean;
  camera: boolean;
  share: boolean;
  selfMute: boolean;
  serverMute: boolean;
}

function emptyStatus(): UserStatus {
  return { speaking: false, camera: false, share: false, selfMute: false, serverMute: false };
}

function applyEvent(status: UserStatus, ev: VoiceEvent): UserStatus {
  switch (ev.kind) {
    case "speaking_start": status.speaking = true; break;
    case "speaking_stop": status.speaking = false; break;
    case "camera_on": status.camera = true; break;
    case "camera_off": status.camera = false; break;
    case "share_start": status.share = true; break;
    case "share_stop": status.share = false; break;
    case "self_mute": status.selfMute = true; break;
    case "self_unmute": status.selfMute = false; break;
    case "server_mute": status.serverMute = true; break;
    case "server_unmute": status.serverMute = false; break;
  }
  return status;
}

/**
 * Render frames + mux with audio into an MP4.
 *
 * Liquid Glass macOS-style layout:
 *   ┌─● ● ● ─── Title ──────────── 00:00 / 05:00 ─┐
 *   │ ═══════════════════════════════════════════════ │  ← progress bar
 *   ├────────────────────────────────┬───────────────┤
 *   │                                │  💬 Chat      │
 *   │   User cards (glass grid)      │  ┌──────┐    │
 *   │   ┌───────┐  ┌───────┐        │  │ msg  │    │
 *   │   │avatar │  │avatar │        │  │ msg  │    │
 *   │   │ name  │  │ name  │        │  └──────┘    │
 *   │   └───────┘  └───────┘        │               │
 *   └────────────────────────────────┴───────────────┘
 */
export async function renderRecording(args: RenderArgs): Promise<string> {
  const { width, height, fps, audioBitrate, videoBitrate } = QUALITY[args.quality];
  const totalSec = args.durationSec;
  const totalFrames = Math.max(1, Math.floor(totalSec * fps));

  log.info(
    { users: args.users.length, durationSec: totalSec, totalFrames, quality: args.quality },
    "render start"
  );

  const mixedWav = await mixAudio(args);

  if (!ffmpegPath) throw new Error("ffmpeg binary not available");
  const ff = spawn(ffmpegPath, [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${width}x${height}`,
    "-r", String(fps),
    "-i", "pipe:0",
    "-i", mixedWav,
    "-map", "0:v",
    "-map", "1:a",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-b:v", videoBitrate,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", audioBitrate,
    "-shortest",
    "-movflags", "+faststart",
    args.outFile,
  ]);

  ff.stderr.on("data", (d) => log.trace({ ff: d.toString() }, "ffmpeg"));
  const ffDone = new Promise<void>((resolve, reject) => {
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}`));
    });
    ff.on("error", reject);
  });

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Preload avatars
  const avatarImgs = new Map<string, Image | null>();
  await Promise.all(
    args.users.map(async (u) => {
      if (!u.avatarUrl) { avatarImgs.set(u.userId, null); return; }
      try {
        const img = await loadImage(u.avatarUrl);
        avatarImgs.set(u.userId, img);
      } catch {
        avatarImgs.set(u.userId, null);
      }
    })
  );

  // Build per-frame user status
  const userStatusInit: Record<string, UserStatus> = {};
  for (const u of args.users) userStatusInit[u.userId] = emptyStatus();
  const sortedEvents = [...args.events].sort((a, b) => a.ts - b.ts);
  let eventIdx = 0;
  const liveStatus = JSON.parse(JSON.stringify(userStatusInit)) as Record<string, UserStatus>;
  const speakEnvelope = computeEnvelope(args.users, fps, totalSec);

  for (let frame = 0; frame < totalFrames; frame++) {
    const tMs = (frame / fps) * 1000;

    while (eventIdx < sortedEvents.length && sortedEvents[eventIdx]!.ts <= tMs) {
      const ev = sortedEvents[eventIdx]!;
      if (!liveStatus[ev.userId]) liveStatus[ev.userId] = emptyStatus();
      applyEvent(liveStatus[ev.userId]!, ev);
      eventIdx++;
    }

    drawFrame(ctx, width, height, {
      title: args.title ?? "تسجيل صوتي | Voice Recording",
      users: args.users,
      avatarImgs,
      status: liveStatus,
      envelope: speakEnvelope[frame] ?? {},
      chat: args.chat,
      tMs,
      totalMs: totalSec * 1000,
    });

    const rgba = ctx.getImageData(0, 0, width, height).data;
    if (!ff.stdin.write(Buffer.from(rgba.buffer))) {
      await new Promise<void>((r) => ff.stdin.once("drain", () => r()));
    }
  }
  ff.stdin.end();
  await ffDone;
  log.info({ out: args.outFile }, "render done");
  return args.outFile;
}

/**
 * Compute a per-frame envelope (0..1) per user from their PCM file.
 */
function computeEnvelope(
  users: UserAudio[],
  fps: number,
  totalSec: number
): Array<Record<string, number>> {
  const totalFrames = Math.max(1, Math.floor(totalSec * fps));
  const out: Array<Record<string, number>> = Array.from({ length: totalFrames }, () => ({}));
  const samplesPerFrame = Math.floor(SAMPLE_RATE / fps);
  const bytesPerFrame = samplesPerFrame * CHANNELS * 2;

  for (const u of users) {
    let fd: number;
    try { fd = fs.openSync(u.pcmFile, "r"); } catch { continue; }
    const buf = Buffer.alloc(bytesPerFrame);
    for (let f = 0; f < totalFrames; f++) {
      const offset = f * bytesPerFrame;
      let n = 0;
      try { n = fs.readSync(fd, buf, 0, bytesPerFrame, offset); } catch { n = 0; }
      if (n <= 0) { out[f]![u.userId] = 0; continue; }
      let sum = 0;
      const stride = 32;
      let count = 0;
      for (let i = 0; i < n - 1; i += stride) {
        sum += Math.abs(buf.readInt16LE(i));
        count++;
      }
      const meanAbs = count > 0 ? sum / count : 0;
      out[f]![u.userId] = Math.min(1, meanAbs / 8000);
    }
    fs.closeSync(fd);
  }
  return out;
}

// ── Drawing Utilities ──────────────────────────────────────

type Ctx = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draw a macOS-style traffic light dot */
function drawDot(ctx: Ctx, cx: number, cy: number, radius: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Inner highlight
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx - radius * 0.2, cy - radius * 0.25, radius * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Liquid Glass panel — translucent with soft border and inner highlight */
function drawGlassPanel(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  // Drop shadow
  ctx.save();
  ctx.shadowColor = LG.windowShadow;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = LG.windowBg;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  // Inner highlight (top edge)
  ctx.save();
  const hlGrad = ctx.createLinearGradient(x, y, x, y + h * 0.15);
  hlGrad.addColorStop(0, LG.glassHighlight);
  hlGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = hlGrad;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  // Border
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = LG.windowBorder;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
  ctx.restore();
}

/** Inner glass card for sub-panels */
function drawInnerGlass(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.save();
  ctx.fillStyle = LG.glassBg;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = LG.glassBorder;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
  ctx.restore();
}

// ── Main Frame Drawing ─────────────────────────────────────

function drawFrame(
  ctx: Ctx,
  W: number,
  H: number,
  args: {
    title: string;
    users: UserAudio[];
    avatarImgs: Map<string, Image | null>;
    status: Record<string, UserStatus>;
    envelope: Record<string, number>;
    chat: ChatMsg[];
    tMs: number;
    totalMs: number;
  }
): void {
  const s = W / 1920; // scale factor relative to 1080p

  // ── Background ─────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, LG.meshA);
  grad.addColorStop(0.5, "#141422");
  grad.addColorStop(1, LG.meshB);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Decorative mesh blobs
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = LG.blobA;
  ctx.beginPath();
  ctx.arc(W * 0.12, H * 0.88, H * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = LG.blobB;
  ctx.beginPath();
  ctx.arc(W * 0.92, H * 0.08, H * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = LG.blobC;
  ctx.beginPath();
  ctx.arc(W * 0.55, H * 0.5, H * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── macOS Window Frame ─────────────────────────────────
  const winPad = Math.round(24 * s);
  const winR = Math.round(16 * s);
  const winX = winPad;
  const winY = winPad;
  const winW = W - winPad * 2;
  const winH = H - winPad * 2;

  drawGlassPanel(ctx, winX, winY, winW, winH, winR);

  // ── Title Bar ──────────────────────────────────────────
  const titleBarH = Math.round(44 * s);
  const titleBarY = winY;

  // Traffic light dots
  const dotR = Math.round(6.5 * s);
  const dotSpacing = Math.round(20 * s);
  const dotStartX = winX + Math.round(20 * s);
  const dotCY = titleBarY + titleBarH / 2;

  drawDot(ctx, dotStartX, dotCY, dotR, LG.dotClose);
  drawDot(ctx, dotStartX + dotSpacing, dotCY, dotR, LG.dotMinimize);
  drawDot(ctx, dotStartX + dotSpacing * 2, dotCY, dotR, LG.dotMaximize);

  // Title text (center)
  ctx.save();
  ctx.fillStyle = LG.textPrimary;
  ctx.font = `600 ${Math.round(15 * s)}px BotUI`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(args.title, winX + winW / 2, dotCY);
  ctx.restore();

  // Time (right side)
  ctx.save();
  ctx.fillStyle = LG.textSecondary;
  ctx.font = `${Math.round(13 * s)}px BotUI`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `${formatTime(args.tMs)} / ${formatTime(args.totalMs)}`,
    winX + winW - Math.round(20 * s),
    dotCY
  );
  ctx.restore();

  // Title bar separator
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(winX + winR, titleBarY + titleBarH);
  ctx.lineTo(winX + winW - winR, titleBarY + titleBarH);
  ctx.stroke();
  ctx.restore();

  // ── Progress Bar ───────────────────────────────────────
  const barH = Math.round(3 * s);
  const barPad = Math.round(20 * s);
  const barY = titleBarY + titleBarH + Math.round(8 * s);
  const barX = winX + barPad;
  const barW = winW - barPad * 2;

  // Track
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();
  ctx.restore();

  // Fill
  const progress = args.totalMs > 0 ? args.tMs / args.totalMs : 0;
  const fillW = Math.max(barH, barW * progress);
  ctx.save();
  const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  barGrad.addColorStop(0, LG.accent);
  barGrad.addColorStop(1, "#a855f7");
  ctx.fillStyle = barGrad;
  roundRect(ctx, barX, barY, fillW, barH, barH / 2);
  ctx.fill();
  ctx.restore();

  // Glow dot at progress head
  if (progress > 0.01) {
    ctx.save();
    ctx.fillStyle = LG.accent;
    ctx.shadowColor = LG.accentGlow;
    ctx.shadowBlur = 10 * s;
    ctx.beginPath();
    ctx.arc(barX + fillW, barY + barH / 2, Math.round(4 * s), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Content Area ───────────────────────────────────────
  const contentTop = barY + barH + Math.round(12 * s);
  const contentPad = Math.round(16 * s);
  const chatW = Math.round(winW * 0.28);

  const cardsArea = {
    x: winX + contentPad,
    y: contentTop,
    w: winW - contentPad * 2 - chatW - Math.round(12 * s),
    h: winY + winH - contentTop - contentPad,
  };
  const chatArea = {
    x: cardsArea.x + cardsArea.w + Math.round(12 * s),
    y: contentTop,
    w: chatW,
    h: cardsArea.h,
  };

  // Glass panels for content areas
  drawInnerGlass(ctx, cardsArea.x, cardsArea.y, cardsArea.w, cardsArea.h, Math.round(14 * s));
  drawInnerGlass(ctx, chatArea.x, chatArea.y, chatArea.w, chatArea.h, Math.round(14 * s));

  // ── User Cards Grid ────────────────────────────────────
  const users = args.users;
  const n = Math.max(1, users.length);
  const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cardPad = Math.round(10 * s);
  const cardW = (cardsArea.w - cardPad * (cols + 1)) / cols;
  const cardH = (cardsArea.h - cardPad * (rows + 1)) / rows;

  users.forEach((u, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cx = cardsArea.x + cardPad + c * (cardW + cardPad);
    const cy = cardsArea.y + cardPad + r * (cardH + cardPad);
    drawUserCard(ctx, cx, cy, cardW, cardH, s, {
      username: u.username,
      img: args.avatarImgs.get(u.userId) ?? null,
      speaking: (args.envelope[u.userId] ?? 0) > 0.05,
      level: args.envelope[u.userId] ?? 0,
      status: args.status[u.userId] ?? emptyStatus(),
    });
  });

  // ── Chat Feed (macOS Messages style) ───────────────────
  drawChatFeed(ctx, chatArea.x, chatArea.y, chatArea.w, chatArea.h, s, {
    chat: args.chat,
    nowMs: args.tMs,
  });
}

// ── User Card ──────────────────────────────────────────────

function drawUserCard(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  args: {
    username: string;
    img: Image | null;
    speaking: boolean;
    level: number;
    status: UserStatus;
  }
): void {
  const r = Math.round(12 * s);

  // Card background
  ctx.save();
  ctx.fillStyle = args.speaking ? LG.cardSpeaking : LG.cardBg;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  // Speaking glow ring
  if (args.speaking) {
    ctx.save();
    ctx.lineWidth = Math.round(2.5 * s);
    ctx.strokeStyle = LG.speakGreen;
    ctx.shadowColor = LG.speakGlow;
    ctx.shadowBlur = Math.round(14 * s) + args.level * Math.round(14 * s);
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = LG.cardBorder;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.stroke();
    ctx.restore();
  }

  // Avatar
  const avSize = Math.min(w * 0.52, h * 0.52);
  const ax = x + (w - avSize) / 2;
  const ay = y + h * 0.1;

  // Avatar shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#1c1c2e";
  ctx.beginPath();
  ctx.arc(ax + avSize / 2, ay + avSize / 2, avSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Avatar image
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + avSize / 2, ay + avSize / 2, avSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (args.img) {
    ctx.drawImage(args.img, ax, ay, avSize, avSize);
  } else {
    ctx.fillStyle = "#2c2c3e";
    ctx.fillRect(ax, ay, avSize, avSize);
    // Default avatar icon
    ctx.fillStyle = LG.textTertiary;
    ctx.font = `${Math.round(avSize * 0.45)}px BotUI`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("👤", ax + avSize / 2, ay + avSize / 2);
  }
  ctx.restore();

  // Avatar ring
  ctx.save();
  ctx.lineWidth = Math.round(2.5 * s);
  ctx.strokeStyle = args.speaking ? LG.speakGreen : "rgba(255, 255, 255, 0.12)";
  if (args.speaking) {
    ctx.shadowColor = LG.speakGlow;
    ctx.shadowBlur = Math.round(8 * s);
  }
  ctx.beginPath();
  ctx.arc(ax + avSize / 2, ay + avSize / 2, avSize / 2 + 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Username
  ctx.save();
  ctx.fillStyle = LG.textPrimary;
  const nameSize = Math.max(12, Math.round(h * 0.12));
  ctx.font = `600 ${nameSize}px BotUI`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(args.username, x + w / 2, y + h * 0.76, w - Math.round(16 * s));
  ctx.restore();

  // Status icons
  const iconY = y + h - Math.round(18 * s);
  const icons: { color: string; label: string }[] = [];
  if (args.status.camera) icons.push({ color: Palette.cameraOn, label: "📹" });
  if (args.status.share) icons.push({ color: Palette.shareOn, label: "🖥" });
  if (args.status.selfMute || args.status.serverMute)
    icons.push({ color: Palette.muted, label: "🔇" });
  const iconW = Math.round(20 * s);
  const iconGap = Math.round(6 * s);
  const totalIconW = icons.length * iconW + Math.max(0, icons.length - 1) * iconGap;
  let ix = x + (w - totalIconW) / 2;
  for (const ic of icons) {
    ctx.save();
    ctx.fillStyle = ic.color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(ix + iconW / 2, iconY, iconW / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Icon label
    ctx.save();
    ctx.font = `${Math.round(iconW * 0.65)}px BotUI`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ic.label, ix + iconW / 2, iconY);
    ctx.restore();
    ix += iconW + iconGap;
  }
}

// ── Chat Feed (macOS Messages style) ───────────────────────

function drawChatFeed(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  s: number,
  args: { chat: ChatMsg[]; nowMs: number }
): void {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, Math.round(14 * s));
  ctx.clip();

  // Header
  const headerH = Math.round(36 * s);
  ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
  ctx.fillRect(x, y, w, headerH);
  // Header separator
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + Math.round(12 * s), y + headerH);
  ctx.lineTo(x + w - Math.round(12 * s), y + headerH);
  ctx.stroke();

  // Header title
  ctx.fillStyle = LG.textPrimary;
  ctx.font = `600 ${Math.round(13 * s)}px BotUI`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("💬 شات | Chat", x + w / 2, y + headerH / 2);

  // Messages
  const visible = args.chat.filter((m) => m.ts <= args.nowMs);
  const last = visible.slice(-10);
  const msgPad = Math.round(10 * s);
  let cy = y + headerH + Math.round(8 * s);
  const bubbleR = Math.round(10 * s);

  for (const m of last) {
    const age = args.nowMs - m.ts;
    const fade = Math.min(1, Math.max(0.3, 1 - age / 60_000));
    ctx.globalAlpha = fade;

    // Username
    ctx.fillStyle = LG.textSecondary;
    ctx.font = `600 ${Math.round(11 * s)}px BotUI`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(m.username, x + w - msgPad, cy);
    cy += Math.round(15 * s);

    // Message bubble
    const text = m.content.length > 60 ? m.content.slice(0, 57) + "…" : m.content;
    const bubbleW = Math.min(w - msgPad * 2, Math.round(text.length * 7 * s) + Math.round(16 * s));
    const bubbleH = Math.round(24 * s);
    const bubbleX = x + w - msgPad - bubbleW;

    ctx.fillStyle = LG.chatBubbleOther;
    roundRect(ctx, bubbleX, cy, bubbleW, bubbleH, bubbleR);
    ctx.fill();

    ctx.fillStyle = LG.textPrimary;
    ctx.font = `${Math.round(11.5 * s)}px BotUI`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w - msgPad - Math.round(6 * s), cy + bubbleH / 2, bubbleW - Math.round(12 * s));

    cy += bubbleH + Math.round(6 * s);
    if (cy > y + h - Math.round(16 * s)) break;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}
