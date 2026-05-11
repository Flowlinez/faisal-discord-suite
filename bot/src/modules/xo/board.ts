import { createCanvas, loadImage, GlobalFonts, type Image } from "@napi-rs/canvas";
import fs from "node:fs";
import { Palette } from "../../utils/colors.js";

try {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      GlobalFonts.registerFromPath(c, "BotUI");
      break;
    }
  }
} catch {
  /* ignore */
}

export type CellValue = "X" | "O" | null;

export interface RenderBoardArgs {
  cells: CellValue[]; // length 9, indexed row-major
  playerX: { name: string; avatarUrl?: string; points: number };
  playerO: { name: string; avatarUrl?: string; points: number };
  turn: "X" | "O" | null;
  round: number;
  totalRounds: number;
  winLine?: [number, number, number] | null;
  winnerLabel?: string | null;
}

const W = 1200;
const H = 700;

export async function renderBoard(args: RenderBoardArgs): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#eef3fb");
  bg.addColorStop(1, "#dde6f3");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Decorative blobs
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#c8d6ec";
  ctx.beginPath();
  ctx.arc(150, 620, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#dcd2ec";
  ctx.beginPath();
  ctx.arc(1080, 100, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Title
  ctx.fillStyle = Palette.text;
  ctx.font = `bold 56px BotUI`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("XO", W / 2, 28);
  ctx.font = `20px BotUI`;
  ctx.fillStyle = Palette.textSoft;
  ctx.fillText(`الجولة ${args.round} / ${args.totalRounds}`, W / 2, 92);

  // Player cards
  await drawPlayerCard(ctx, 40, 150, args.playerX, "X", args.turn === "X");
  await drawPlayerCard(ctx, W - 40 - 280, 150, args.playerO, "O", args.turn === "O");

  // VS in the middle
  ctx.fillStyle = Palette.textSoft;
  ctx.font = `bold 36px BotUI`;
  ctx.fillText("🆚", W / 2, 230);

  // Board
  const boardSize = 420;
  const boardX = (W - boardSize) / 2;
  const boardY = 250;
  drawGlassPanel(ctx, boardX - 20, boardY - 20, boardSize + 40, boardSize + 40, 28);

  const cell = boardSize / 3;
  // Grid lines
  ctx.save();
  ctx.strokeStyle = "rgba(60, 80, 120, 0.25)";
  ctx.lineWidth = 4;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(boardX + i * cell, boardY + 16);
    ctx.lineTo(boardX + i * cell, boardY + boardSize - 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(boardX + 16, boardY + i * cell);
    ctx.lineTo(boardX + boardSize - 16, boardY + i * cell);
    ctx.stroke();
  }
  ctx.restore();

  // Cells
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3);
    const c = i % 3;
    const cx = boardX + c * cell + cell / 2;
    const cy = boardY + r * cell + cell / 2;
    const v = args.cells[i];
    if (v === "X") drawX(ctx, cx, cy, cell * 0.62);
    if (v === "O") drawO(ctx, cx, cy, cell * 0.62);
  }

  // Win line
  if (args.winLine) {
    const [a, , b] = args.winLine;
    const ax = boardX + (a % 3) * cell + cell / 2;
    const ay = boardY + Math.floor(a / 3) * cell + cell / 2;
    const bx = boardX + (b % 3) * cell + cell / 2;
    const by = boardY + Math.floor(b / 3) * cell + cell / 2;
    ctx.save();
    ctx.strokeStyle = Palette.winLine;
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  }

  // Winner label
  if (args.winnerLabel) {
    ctx.fillStyle = Palette.text;
    ctx.font = `bold 28px BotUI`;
    ctx.textAlign = "center";
    ctx.fillText(args.winnerLabel, W / 2, boardY + boardSize + 18);
  }

  return canvas.toBuffer("image/png");
}

async function drawPlayerCard(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  x: number,
  y: number,
  p: { name: string; avatarUrl?: string; points: number },
  symbol: "X" | "O",
  active: boolean
): Promise<void> {
  const w = 280;
  const h = 90;
  drawGlassPanel(ctx, x, y, w, h, 22);
  if (active) {
    ctx.save();
    ctx.strokeStyle = symbol === "X" ? Palette.blueX : Palette.redO;
    ctx.shadowColor = symbol === "X" ? Palette.blueX : Palette.redO;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 22);
    ctx.stroke();
    ctx.restore();
  }
  const avSize = 64;
  let img: Image | null = null;
  if (p.avatarUrl) {
    try {
      img = await loadImage(p.avatarUrl);
    } catch {
      img = null;
    }
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + 12 + avSize / 2, y + (h - avSize) / 2 + avSize / 2, avSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x + 12, y + (h - avSize) / 2, avSize, avSize);
  } else {
    ctx.fillStyle = "#cdd6e4";
    ctx.fillRect(x + 12, y + (h - avSize) / 2, avSize, avSize);
  }
  ctx.restore();

  // Symbol badge
  ctx.save();
  ctx.fillStyle = symbol === "X" ? Palette.blueX : Palette.redO;
  ctx.beginPath();
  ctx.arc(x + 12 + avSize - 6, y + (h - avSize) / 2 + 6, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px BotUI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol, x + 12 + avSize - 6, y + (h - avSize) / 2 + 7);
  ctx.restore();

  // Name + points
  ctx.fillStyle = Palette.text;
  ctx.font = "bold 20px BotUI";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(p.name, x + 12 + avSize + 14, y + 14, w - avSize - 30);

  ctx.fillStyle = Palette.textSoft;
  ctx.font = "16px BotUI";
  ctx.fillText(`${p.points} نقطة`, x + 12 + avSize + 14, y + 44);
}

function drawX(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  cx: number,
  cy: number,
  size: number
): void {
  ctx.save();
  ctx.strokeStyle = Palette.blueX;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.shadowColor = Palette.blueX;
  ctx.shadowBlur = 10;
  const r = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r);
  ctx.lineTo(cx + r, cy + r);
  ctx.moveTo(cx + r, cy - r);
  ctx.lineTo(cx - r, cy + r);
  ctx.stroke();
  ctx.restore();
}

function drawO(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  cx: number,
  cy: number,
  size: number
): void {
  ctx.save();
  ctx.strokeStyle = Palette.redO;
  ctx.lineWidth = 14;
  ctx.shadowColor = Palette.redO;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGlassPanel(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
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
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
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
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
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
