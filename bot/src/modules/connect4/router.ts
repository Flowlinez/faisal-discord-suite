import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type Interaction,
} from "discord.js";
import { parseId, IDS } from "../../utils/ids.js";
import { createC4Game, dropDisc, type C4Game } from "./game.js";
import { destroyC4Lobby, getC4Lobby, joinC4Lobby } from "./lobby.js";
import { errorEmbed, gameEmbed } from "../../ui/embeds.js";
import { Palette } from "../../utils/colors.js";
import { L } from "../../utils/locale.js";
import { logger } from "../../utils/logger.js";
import { addRoundWin, addLoss, addDraw } from "../../db/points.js";

const log = logger.child({ mod: "c4-router" });

export async function c4Router(interaction: Interaction): Promise<void> {
  if (!interaction.isButton() || !interaction.guild) return;
  const { action, args } = parseId(interaction.customId);
  switch (action) {
    case "join":
      return joinBtn(interaction, args[0]!);
    case "col":
      return colBtn(interaction, args[0]!, parseInt(args[1] ?? "0", 10));
    case "cancel":
      return cancelBtn(interaction, args[0]!);
    default:
      log.warn({ action }, "unknown c4 action");
  }
}

async function joinBtn(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  const lobby = getC4Lobby(lobbyId);
  if (!lobby) {
    await interaction.reply({
      embeds: [errorEmbed("اللوبي انتهى | Lobby expired.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  joinC4Lobby(lobbyId, interaction.user.id);
  if (lobby.joiners.length < 2) {
    await interaction.deferUpdate();
    return;
  }

  const member1 = await interaction.guild!.members.fetch(lobby.joiners[0]!);
  const member2 = await interaction.guild!.members.fetch(lobby.joiners[1]!);

  const game = createC4Game({
    guildId: lobby.guildId,
    channelId: lobby.channelId,
    playerR: {
      userId: member1.id,
      name: member1.displayName,
      avatarUrl: member1.displayAvatarURL({ extension: "png", size: 128 }),
    },
    playerY: {
      userId: member2.id,
      name: member2.displayName,
      avatarUrl: member2.displayAvatarURL({ extension: "png", size: 128 }),
    },
  });
  destroyC4Lobby(lobbyId);

  await interaction.deferUpdate();
  await interaction.message.edit({
    content: `🔴 <@${game.playerR.userId}> 🆚 <@${game.playerY.userId}> 🟡`,
    embeds: [
      gameEmbed(
        `${boardToString(game)}\n\n${L.c4Turn(game.playerR.name)}`,
        L.c4Started,
        Palette.info
      ),
    ],
    components: columnButtons(game),
  });
}

async function cancelBtn(interaction: ButtonInteraction, id: string): Promise<void> {
  destroyC4Lobby(id);
  await interaction.update({
    content: "تم إلغاء اللعبة | Game cancelled.",
    embeds: [],
    components: [],
  });
}

async function colBtn(
  interaction: ButtonInteraction,
  gameId: string,
  col: number
): Promise<void> {
  const result = dropDisc(gameId, interaction.user.id, col);
  if (!result.ok || !result.game) {
    await interaction.reply({
      embeds: [errorEmbed(result.reason ?? "حركة غير صالحة | Invalid move.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const game = result.game;

  if (game.status === "finished") {
    if (game.winner === "draw") {
      addDraw(game.guildId, [game.playerR.userId, game.playerY.userId]);
    } else if (game.winner) {
      const winnerId = game.winner === "R" ? game.playerR.userId : game.playerY.userId;
      const loserId = game.winner === "R" ? game.playerY.userId : game.playerR.userId;
      addRoundWin(game.guildId, winnerId);
      addLoss(game.guildId, loserId);
    }
  }

  const desc = game.status === "finished"
    ? game.winner === "draw"
      ? `${boardToString(game)}\n\n${L.c4Draw}`
      : `${boardToString(game)}\n\n${L.c4Winner(game.winner === "R" ? game.playerR.name : game.playerY.name)}`
    : `${boardToString(game)}\n\n${L.c4Turn(game.turn === "R" ? game.playerR.name : game.playerY.name)}`;

  const title = game.status === "finished" ? L.c4Finished : "Connect 4";
  const color = game.status === "finished" ? Palette.gold : Palette.info;

  await interaction.update({
    embeds: [gameEmbed(desc, title, color)],
    components: game.status === "finished" ? [] : columnButtons(game),
  });
}

function boardToString(game: C4Game): string {
  const lines: string[] = [];
  for (const row of game.board) {
    const cells = row.map((c) => {
      if (c === "R") return "🔴";
      if (c === "Y") return "🟡";
      return "⚫";
    });
    lines.push(cells.join(""));
  }
  lines.push("1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣");
  return lines.join("\n");
}

function columnButtons(game: C4Game): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>();
  const row2 = new ActionRowBuilder<ButtonBuilder>();
  for (let c = 0; c < 7; c++) {
    const full = game.board[0]![c] !== null;
    const btn = new ButtonBuilder()
      .setCustomId(`${IDS.c4.col}:${game.id}:${c}`)
      .setStyle(game.turn === "R" ? ButtonStyle.Danger : ButtonStyle.Primary)
      .setLabel(`${c + 1}`)
      .setDisabled(full);
    if (c < 4) row1.addComponents(btn);
    else row2.addComponents(btn);
  }
  return [row1, row2];
}
