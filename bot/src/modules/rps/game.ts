export type RPSChoice = "rock" | "paper" | "scissors";

export interface RPSPlayer {
  userId: string;
  name: string;
  choice: RPSChoice | null;
}

export interface RPSGame {
  id: string;
  guildId: string;
  channelId: string;
  player1: RPSPlayer;
  player2: RPSPlayer;
  status: "waiting" | "active" | "finished";
  winner: string | "draw" | null; // userId or "draw"
  rounds: number;
  currentRound: number;
  scores: { p1: number; p2: number };
}

const games = new Map<string, RPSGame>();
const lobbies = new Map<string, { id: string; guildId: string; channelId: string; hostId: string; rounds: number; startedAt: number }>();

export function createRPSLobby(args: {
  id: string;
  guildId: string;
  channelId: string;
  hostId: string;
  rounds: number;
}): void {
  lobbies.set(args.id, {
    id: args.id,
    guildId: args.guildId,
    channelId: args.channelId,
    hostId: args.hostId,
    rounds: args.rounds,
    startedAt: Date.now(),
  });
}

export function getRPSLobby(id: string) {
  return lobbies.get(id);
}

export function destroyRPSLobby(id: string): void {
  lobbies.delete(id);
}

export function createRPSGame(args: {
  lobbyId: string;
  guildId: string;
  channelId: string;
  player1: { userId: string; name: string };
  player2: { userId: string; name: string };
  rounds: number;
}): RPSGame {
  const g: RPSGame = {
    id: args.lobbyId,
    guildId: args.guildId,
    channelId: args.channelId,
    player1: { ...args.player1, choice: null },
    player2: { ...args.player2, choice: null },
    status: "active",
    winner: null,
    rounds: args.rounds,
    currentRound: 1,
    scores: { p1: 0, p2: 0 },
  };
  games.set(g.id, g);
  return g;
}

export function getRPSGame(id: string): RPSGame | undefined {
  return games.get(id);
}

const EMOJI: Record<RPSChoice, string> = {
  rock: "🪨",
  paper: "📄",
  scissors: "✂️",
};

export function choiceEmoji(c: RPSChoice): string {
  return EMOJI[c];
}

export function makeRPSChoice(
  gameId: string,
  userId: string,
  choice: RPSChoice
): { ok: boolean; reason?: string; game: RPSGame | null; roundDone: boolean; p1Choice?: RPSChoice; p2Choice?: RPSChoice } {
  const g = games.get(gameId);
  if (!g) return { ok: false, reason: "اللعبة غير موجودة | Game not found.", game: null, roundDone: false };
  if (g.status !== "active") return { ok: false, reason: "اللعبة منتهية | Game is over.", game: g, roundDone: false };

  if (userId === g.player1.userId) {
    if (g.player1.choice) return { ok: false, reason: "اخترت فعلاً | Already chosen.", game: g, roundDone: false };
    g.player1.choice = choice;
  } else if (userId === g.player2.userId) {
    if (g.player2.choice) return { ok: false, reason: "اخترت فعلاً | Already chosen.", game: g, roundDone: false };
    g.player2.choice = choice;
  } else {
    return { ok: false, reason: "مو لاعب | Not a player.", game: g, roundDone: false };
  }

  if (g.player1.choice && g.player2.choice) {
    const p1c = g.player1.choice;
    const p2c = g.player2.choice;
    resolveRound(g);
    return { ok: true, game: g, roundDone: true, p1Choice: p1c, p2Choice: p2c };
  }
  return { ok: true, game: g, roundDone: false };
}

function resolveRound(g: RPSGame): void {
  const c1 = g.player1.choice!;
  const c2 = g.player2.choice!;

  if (c1 === c2) {
    // draw round — no score
  } else if (
    (c1 === "rock" && c2 === "scissors") ||
    (c1 === "paper" && c2 === "rock") ||
    (c1 === "scissors" && c2 === "paper")
  ) {
    g.scores.p1++;
  } else {
    g.scores.p2++;
  }

  if (g.currentRound >= g.rounds) {
    g.status = "finished";
    if (g.scores.p1 > g.scores.p2) g.winner = g.player1.userId;
    else if (g.scores.p2 > g.scores.p1) g.winner = g.player2.userId;
    else g.winner = "draw";
  } else {
    g.currentRound++;
    g.player1.choice = null;
    g.player2.choice = null;
  }
}
