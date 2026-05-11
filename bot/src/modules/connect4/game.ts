import { randomUUID } from "node:crypto";

export type Disc = "R" | "Y"; // Red / Yellow

export interface Player {
  userId: string;
  name: string;
  avatarUrl?: string;
}

export interface C4Game {
  id: string;
  guildId: string;
  channelId: string;
  playerR: Player;
  playerY: Player;
  board: (Disc | null)[][]; // 6 rows x 7 cols
  turn: Disc;
  status: "active" | "finished";
  winLine: [number, number][] | null;
  winner: Disc | "draw" | null;
}

const ROWS = 6;
const COLS = 7;

const games = new Map<string, C4Game>();

export function createC4Game(args: {
  guildId: string;
  channelId: string;
  playerR: Player;
  playerY: Player;
}): C4Game {
  const board: (Disc | null)[][] = Array.from({ length: ROWS }, () =>
    new Array<Disc | null>(COLS).fill(null)
  );
  const g: C4Game = {
    id: randomUUID(),
    guildId: args.guildId,
    channelId: args.channelId,
    playerR: args.playerR,
    playerY: args.playerY,
    board,
    turn: "R",
    status: "active",
    winLine: null,
    winner: null,
  };
  games.set(g.id, g);
  return g;
}

export function getC4Game(id: string): C4Game | undefined {
  return games.get(id);
}

export function dropDisc(
  id: string,
  userId: string,
  col: number
): { ok: boolean; reason?: string; game: C4Game | null } {
  const g = games.get(id);
  if (!g) return { ok: false, reason: "اللعبة غير موجودة | Game not found.", game: null };
  if (g.status !== "active") return { ok: false, reason: "اللعبة منتهية | Game is over.", game: g };
  if (col < 0 || col >= COLS) return { ok: false, reason: "عمود غير صالح | Invalid column.", game: g };

  const expectedUser = g.turn === "R" ? g.playerR.userId : g.playerY.userId;
  if (userId !== expectedUser) return { ok: false, reason: "مو دورك | Not your turn.", game: g };

  // Find lowest empty row in column
  let row = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (g.board[r]![col] === null) {
      row = r;
      break;
    }
  }
  if (row === -1) return { ok: false, reason: "العمود ممتلئ | Column is full.", game: g };

  g.board[row]![col] = g.turn;

  const win = findWin(g.board, g.turn, row, col);
  if (win) {
    g.winLine = win;
    g.winner = g.turn;
    g.status = "finished";
  } else if (isBoardFull(g.board)) {
    g.winner = "draw";
    g.status = "finished";
  } else {
    g.turn = g.turn === "R" ? "Y" : "R";
  }

  return { ok: true, game: g };
}

function isBoardFull(board: (Disc | null)[][]): boolean {
  return board[0]!.every((cell) => cell !== null);
}

function findWin(
  board: (Disc | null)[][],
  disc: Disc,
  row: number,
  col: number
): [number, number][] | null {
  const dirs = [
    [0, 1], [1, 0], [1, 1], [1, -1],
  ];
  for (const [dr, dc] of dirs) {
    const line: [number, number][] = [[row, col]];
    for (const sign of [1, -1]) {
      for (let step = 1; step < 4; step++) {
        const r = row + dr! * step * sign;
        const c = col + dc! * step * sign;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
        if (board[r]![c] !== disc) break;
        line.push([r, c]);
      }
    }
    if (line.length >= 4) return line.slice(0, 4);
  }
  return null;
}
