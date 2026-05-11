import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type Interaction,
} from "discord.js";
import { parseId, IDS } from "../../utils/ids.js";
import {
  createGame,
  getGame,
  makeMove,
  matchWinner,
  type Game,
} from "./game.js";
import { destroyLobby, getLobby, joinLobby } from "./lobby.js";
import { renderBoard } from "./board.js";
import { addDraw, addLoss, addMatchWin, addRoundWin, getUserPoints } from "../../db/points.js";
import { errorEmbed, successEmbed, buildEmbed } from "../../ui/embeds.js";
import { Palette } from "../../utils/colors.js";
import { L } from "../../utils/locale.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ mod: "xo-router" });

export async function xoRouter(interaction: Interaction): Promise<void> {
  if (!interaction.isButton() || !interaction.guild) return;
  const { action, args } = parseId(interaction.customId);
  switch (action) {
    case "join":
      return joinBtn(interaction, args[0]!);
    case "cell":
      return cellBtn(interaction, args[0]!, parseInt(args[1] ?? "0", 10));
    case "cancel":
      return cancelBtn(interaction, args[0]!);
    default:
      log.warn({ action }, "unknown xo action");
  }
}

async function joinBtn(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  const lobby = getLobby(lobbyId);
  if (!lobby) {
    await interaction.reply({
      embeds: [errorEmbed("اللوبي انتهى | Lobby expired.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  joinLobby(lobbyId, interaction.user.id);
  if (lobby.joiners.length < 2) {
    await interaction.deferUpdate();
    return;
  }

  // Start match with first two joiners
  const member1 = await interaction.guild!.members.fetch(lobby.joiners[0]!);
  const member2 = await interaction.guild!.members.fetch(lobby.joiners[1]!);

  const game = createGame({
    guildId: lobby.guildId,
    channelId: lobby.channelId,
    playerX: {
      userId: member1.id,
      name: member1.displayName,
      avatarUrl: member1.displayAvatarURL({ extension: "png", size: 128 }),
    },
    playerO: {
      userId: member2.id,
      name: member2.displayName,
      avatarUrl: member2.displayAvatarURL({ extension: "png", size: 128 }),
    },
    totalRounds: lobby.totalRounds,
  });
  destroyLobby(lobbyId);

  await interaction.deferUpdate();
  const buf = await renderBoard({
    cells: game.cells,
    playerX: { name: game.playerX.name, avatarUrl: game.playerX.avatarUrl, points: 0 },
    playerO: { name: game.playerO.name, avatarUrl: game.playerO.avatarUrl, points: 0 },
    turn: game.turn,
    round: game.currentRound,
    totalRounds: game.totalRounds,
  });
  await interaction.message.edit({
    content: `<@${game.playerX.userId}> 🆚 <@${game.playerO.userId}>`,
    embeds: [
      buildEmbed({
        title: `🎮 ${L.xoStarted}`,
        description: `${L.xoRound(game.currentRound, game.totalRounds)}`,
        color: Palette.accent,
      }),
    ],
    files: [new AttachmentBuilder(buf).setName("xo.png")],
    components: cellRows(game),
  });
}

async function cancelBtn(interaction: ButtonInteraction, id: string): Promise<void> {
  destroyLobby(id);
  await interaction.update({
    content: "تم إلغاء اللعبة | Game cancelled.",
    embeds: [],
    components: [],
  });
}

async function cellBtn(
  interaction: ButtonInteraction,
  gameId: string,
  cellIdx: number
): Promise<void> {
  const before = getGame(gameId);
  if (!before) {
    await interaction.reply({
      embeds: [errorEmbed("اللعبة غير موجودة | Game not found.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const result = makeMove(gameId, interaction.user.id, cellIdx);
  if (!result.ok || !result.game) {
    await interaction.reply({
      embeds: [errorEmbed(result.reason ?? "حركة غير صالحة | Invalid move.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const game = result.game;

  // Update points on round end
  if (game.lastWinner) {
    if (game.lastWinner === "draw") {
      addDraw(game.guildId, [game.playerX.userId, game.playerO.userId]);
    } else {
      const winnerId =
        game.lastWinner === "X" ? game.playerX.userId : game.playerO.userId;
      const loserId =
        game.lastWinner === "X" ? game.playerO.userId : game.playerX.userId;
      addRoundWin(game.guildId, winnerId);
      addLoss(game.guildId, loserId);
    }
  }

  // If finished, update match points + reset turn label
  let winnerLabel: string | null = null;
  if (game.status === "finished") {
    const mw = matchWinner(game);
    if (mw === "draw") {
      winnerLabel = L.xoMatchDraw;
      addDraw(game.guildId, [game.playerX.userId, game.playerO.userId]);
    } else if (mw === "X") {
      winnerLabel = L.xoWinner(game.playerX.name);
      addMatchWin(game.guildId, game.playerX.userId);
    } else if (mw === "O") {
      winnerLabel = L.xoWinner(game.playerO.name);
      addMatchWin(game.guildId, game.playerO.userId);
    }
  }

  const px = getUserPoints(game.guildId, game.playerX.userId);
  const po = getUserPoints(game.guildId, game.playerO.userId);
  const buf = await renderBoard({
    cells: game.cells,
    playerX: { name: game.playerX.name, avatarUrl: game.playerX.avatarUrl, points: px.round_wins },
    playerO: { name: game.playerO.name, avatarUrl: game.playerO.avatarUrl, points: po.round_wins },
    turn: game.status === "finished" ? null : game.turn,
    round: game.currentRound,
    totalRounds: game.totalRounds,
    winLine: game.winLine ?? null,
    winnerLabel,
  });

  const components = game.status === "finished" ? [] : cellRows(game);
  await interaction.update({
    embeds: [
      buildEmbed({
        title: game.status === "finished" ? `🏆 ${L.xoFinished}` : `🎮 XO — ${L.xoRound(game.currentRound, game.totalRounds)}`,
        description:
          game.status === "finished"
            ? winnerLabel ?? L.xoFinished
            : L.xoTurn(game.turn === "X" ? game.playerX.name : game.playerO.name),
        color: game.status === "finished" ? Palette.gold : Palette.accent,
      }),
    ],
    files: [new AttachmentBuilder(buf).setName("xo.png")],
    components,
  });

  if (game.status === "finished") {
    await interaction.followUp({
      embeds: [successEmbed(L.xoPointsHint)],
    });
  }
}

function cellRows(game: Game): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const val = game.cells[idx];
      const btn = new ButtonBuilder().setCustomId(`${IDS.xo.cell}:${game.id}:${idx}`);
      if (val === "X") {
        btn.setStyle(ButtonStyle.Primary).setLabel("X").setDisabled(true);
      } else if (val === "O") {
        btn.setStyle(ButtonStyle.Danger).setLabel("O").setDisabled(true);
      } else {
        btn.setStyle(ButtonStyle.Secondary).setLabel("\u200b");
      }
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}
