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
  low: { width: 854, height: 480, fps: 12, audioBitrate: "96k", videoBitrate: "600k" },
  medium: { width: 1280, height: 720, fps: 15, audioBitrate: "128k", videoBitrate: "1500k" },
  high: { width: 1920, height: 1080, fps: 24, audioBitrate: "192k", videoBitrate: "3500k" },
} as const;

/**
 * Mix per-user PCM into a single stereo wav file, applying mute/volume.
 * Returns path to the mixed wav file.
 */
async function mixAudio(args: RenderArgs): Promise<string> {
  const { users, edit, outDir, durationSec } = args;
  const mixedPath = path.join(outDir, "mixed.wav");

  // Use ffmpeg's amix filter on all user files as PCM s16le inputs.
  if (users.length === 0) {
    // Emit silence
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

interface SpeakingState {
  [userId: string]: boolean;
}

interface UserStatus {
  speaking: boolean;
  camera: boolean;
  share: boolean;
  selfMute: boolean;
  serverMute: boolean;
}

function emptyStatus(): UserStatus {
  return {
    speaking: false,
    camera: false,
    share: false,
    selfMute: false,
    serverMute: false,
  };
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
 * Frames are produced via @napi-rs/canvas and piped as raw RGBA into ffmpeg.
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │  Title bar                                   │
 *   ├─────────────────────────────────┬────────────┤
 *   │                                 │            │
 *   │   User cards (grid)             │  Chat feed │
 *   │   (avatar + name + status)      │            │
 *   │                                 │            │
 *   └─────────────────────────────────┴────────────┘
 */
export async function renderRecording(args: RenderArgs): Promise<string> {
  const { width, height, fps, audioBitrate, videoBitrate } = QUALITY[args.quality];
  const totalSec = args.durationSec;
  const totalFrames = Math.max(1, Math.floor(totalSec * fps));

  log.info(
    { users: args.users.length, durationSec: totalSec, totalFrames, quality: args.quality },
    "render start"
  );

  // 1. Mix audio
  const mixedWav = await mixAudio(args);

  // 2. Spawn ffmpeg expecting rawvideo on stdin
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

  // 3. Render frames
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Preload avatars
  const avatarImgs = new Map<string, Image | null>();
  await Promise.all(
    args.users.map(async (u) => {
      if (!u.avatarUrl) {
        avatarImgs.set(u.userId, null);
        return;
      }
      try {
        const img = await loadImage(u.avatarUrl);
        avatarImgs.set(u.userId, img);
      } catch {
        avatarImgs.set(u.userId, null);
      }
    })
  );

  // Build per-frame user status snapshots by walking events
  const userStatusInit: Record<string, UserStatus> = {};
  for (const u of args.users) userStatusInit[u.userId] = emptyStatus();
  // Sort events
  const sortedEvents = [...args.events].sort((a, b) => a.ts - b.ts);
  let eventIdx = 0;
  const liveStatus = JSON.parse(JSON.stringify(userStatusInit)) as Record<string, UserStatus>;

  // For "speaking" detection from audio energy, do a coarse RMS lookup per-user.
  // (Cheap approximation: read raw PCM and compute envelope at frame rate.)
  const speakEnvelope = computeEnvelope(args.users, fps, totalSec);

  for (let frame = 0; frame < totalFrames; frame++) {
    const tMs = (frame / fps) * 1000;

    // Apply any events whose ts <= tMs
    while (eventIdx < sortedEvents.length && sortedEvents[eventIdx]!.ts <= tMs) {
      const ev = sortedEvents[eventIdx]!;
      if (!liveStatus[ev.userId]) liveStatus[ev.userId] = emptyStatus();
      applyEvent(liveStatus[ev.userId]!, ev);
      eventIdx++;
    }

    drawFrame(ctx, width, height, {
      title: args.title ?? "تسجيل صوتي",
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
 * Cheap: subsample the PCM, take abs mean over a frame's worth of samples.
 */
function computeEnvelope(
  users: UserAudio[],
  fps: number,
  totalSec: number
): Array<Record<string, number>> {
  const totalFrames = Math.max(1, Math.floor(totalSec * fps));
  const out: Array<Record<string, number>> = Array.from(
    { length: totalFrames },
    () => ({})
  );
  const samplesPerFrame = Math.floor(SAMPLE_RATE / fps);
  const bytesPerFrame = samplesPerFrame * CHANNELS * 2;

  for (const u of users) {
    let fd: number;
    try {
      fd = fs.openSync(u.pcmFile, "r");
    } catch {
      continue;
    }
    const buf = Buffer.alloc(bytesPerFrame);
    for (let f = 0; f < totalFrames; f++) {
      const offset = f * bytesPerFrame;
      let n = 0;
      try {
        n = fs.readSync(fd, buf, 0, bytesPerFrame, offset);
      } catch {
        n = 0;
      }
      if (n <= 0) {
        out[f]![u.userId] = 0;
        continue;
      }
      let sum = 0;
      const stride = 32; // sample every 32 bytes for speed
      let count = 0;
      for (let i = 0; i < n - 1; i += stride) {
        const s = buf.readInt16LE(i);
        sum += Math.abs(s);
        count++;
      }
      const meanAbs = count > 0 ? sum / count : 0;
      const norm = Math.min(1, meanAbs / 8000);
      out[f]![u.userId] = norm;
    }
    fs.closeSync(fd);
  }
  return out;
}

type Ctx = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

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
  // Background — soft gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#eef3fb");
  grad.addColorStop(1, "#dde6f3");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Decorative blobs
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#c8d6ec";
  ctx.beginPath();
  ctx.arc(W * 0.15, H * 0.85, H * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#dcd2ec";
  ctx.beginPath();
  ctx.arc(W * 0.9, H * 0.1, H * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Title bar
  const titleH = Math.round(H * 0.08);
  drawGlassPanel(ctx, 16, 16, W - 32, titleH, 18);
  ctx.fillStyle = Palette.text;
  ctx.font = `bold ${Math.round(titleH * 0.5)}px BotUI`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(args.title, W - 36, 16 + titleH / 2);

  // Time
  ctx.font = `${Math.round(titleH * 0.38)}px BotUI`;
  ctx.fillStyle = Palette.textSoft;
  ctx.textAlign = "left";
  ctx.fillText(
    `${formatTime(args.tMs)} / ${formatTime(args.totalMs)}`,
    36,
    16 + titleH / 2
  );

  // Layout
  const padTop = 16 + titleH + 14;
  const chatW = Math.round(W * 0.28);
  const cardsArea = {
    x: 16,
    y: padTop,
    w: W - 32 - chatW - 14,
    h: H - padTop - 16,
  };
  const chatArea = {
    x: cardsArea.x + cardsArea.w + 14,
    y: padTop,
    w: chatW,
    h: H - padTop - 16,
  };

  drawGlassPanel(ctx, cardsArea.x, cardsArea.y, cardsArea.w, cardsArea.h, 22);
  drawGlassPanel(ctx, chatArea.x, chatArea.y, chatArea.w, chatArea.h, 22);

  // User cards grid
  const users = args.users;
  const n = Math.max(1, users.length);
  const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cardPad = 14;
  const cardW = (cardsArea.w - cardPad * (cols + 1)) / cols;
  const cardH = (cardsArea.h - cardPad * (rows + 1)) / rows;

  users.forEach((u, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = cardsArea.x + cardPad + c * (cardW + cardPad);
    const y = cardsArea.y + cardPad + r * (cardH + cardPad);
    drawUserCard(ctx, x, y, cardW, cardH, {
      username: u.username,
      img: args.avatarImgs.get(u.userId) ?? null,
      speaking: (args.envelope[u.userId] ?? 0) > 0.05,
      level: args.envelope[u.userId] ?? 0,
      status: args.status[u.userId] ?? emptyStatus(),
    });
  });

  // Chat feed
  drawChatFeed(ctx, chatArea.x, chatArea.y, chatArea.w, chatArea.h, {
    chat: args.chat,
    nowMs: args.tMs,
  });
}

function drawGlassPanel(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.save();
  ctx.shadowColor = "rgba(60, 80, 120, 0.18)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
  ctx.restore();
}

function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawUserCard(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  args: {
    username: string;
    img: Image | null;
    speaking: boolean;
    level: number;
    status: UserStatus;
  }
): void {
  // Card background
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  roundRect(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.restore();

  // Speaking glow
  if (args.speaking) {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = Palette.speaking;
    ctx.shadowColor = Palette.speaking;
    ctx.shadowBlur = 18 + args.level * 18;
    roundRect(ctx, x, y, w, h, 18);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 18);
    ctx.stroke();
    ctx.restore();
  }

  // Avatar
  const avSize = Math.min(w * 0.55, h * 0.55);
  const ax = x + (w - avSize) / 2;
  const ay = y + h * 0.12;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + avSize / 2, ay + avSize / 2, avSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (args.img) {
    ctx.drawImage(args.img, ax, ay, avSize, avSize);
  } else {
    ctx.fillStyle = "#cdd6e4";
    ctx.fillRect(ax, ay, avSize, avSize);
  }
  ctx.restore();

  // Avatar border
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = args.speaking ? Palette.speaking : "rgba(255, 255, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(ax + avSize / 2, ay + avSize / 2, avSize / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Username
  ctx.save();
  ctx.fillStyle = Palette.text;
  const nameSize = Math.max(14, Math.round(h * 0.13));
  ctx.font = `bold ${nameSize}px BotUI`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(args.username, x + w / 2, y + h * 0.78, w - 20);
  ctx.restore();

  // Status icons row
  const iconY = y + h - 22;
  const icons: { color: string; label: string }[] = [];
  if (args.status.camera) icons.push({ color: Palette.cameraOn, label: "📹" });
  if (args.status.share) icons.push({ color: Palette.shareOn, label: "🖥" });
  if (args.status.selfMute || args.status.serverMute)
    icons.push({ color: Palette.muted, label: "🔇" });
  const iconW = 22;
  const gap = 6;
  const totalIconW = icons.length * iconW + Math.max(0, icons.length - 1) * gap;
  let ix = x + (w - totalIconW) / 2;
  for (const ic of icons) {
    ctx.save();
    ctx.fillStyle = ic.color;
    ctx.beginPath();
    ctx.arc(ix + iconW / 2, iconY, iconW / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ix += iconW + gap;
  }
}

function drawChatFeed(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  args: { chat: ChatMsg[]; nowMs: number }
): void {
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 22);
  ctx.clip();

  ctx.fillStyle = Palette.text;
  ctx.font = `bold 18px BotUI`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("شات الروم", x + w - 14, y + 12);

  // Show messages whose ts <= nowMs, fade older ones
  const visible = args.chat.filter((m) => m.ts <= args.nowMs);
  const last = visible.slice(-12);
  let cy = y + 44;
  ctx.font = `14px BotUI`;
  for (const m of last) {
    const age = args.nowMs - m.ts;
    const fade = Math.min(1, Math.max(0.35, 1 - age / 60_000));
    ctx.globalAlpha = fade;
    const lineH = 22;
    ctx.fillStyle = Palette.text;
    ctx.font = `bold 13px BotUI`;
    ctx.textAlign = "right";
    ctx.fillText(m.username, x + w - 14, cy);
    cy += 16;
    ctx.fillStyle = Palette.textSoft;
    ctx.font = `13px BotUI`;
    const text = m.content.length > 80 ? m.content.slice(0, 77) + "…" : m.content;
    ctx.fillText(text, x + w - 14, cy, w - 28);
    cy += lineH;
    if (cy > y + h - 20) break;
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
