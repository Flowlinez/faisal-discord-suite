import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type Interaction,
} from "discord.js";
import { parseId, IDS } from "../../utils/ids.js";
import {
  createRPSGame,
  getRPSLobby,
  destroyRPSLobby,
  makeRPSChoice,
  choiceEmoji,
  type RPSChoice,
} from "./game.js";
import { errorEmbed, gameEmbed, successEmbed } from "../../ui/embeds.js";
import { Palette } from "../../utils/colors.js";
import { L } from "../../utils/locale.js";
import { logger } from "../../utils/logger.js";
import { addRoundWin, addLoss, addDraw } from "../../db/points.js";

const log = logger.child({ mod: "rps-router" });

export async function rpsRouter(interaction: Interaction): Promise<void> {
  if (!interaction.isButton() || !interaction.guild) return;
  const { ns, action, args } = parseId(interaction.customId);
  if (ns !== "rps") return;

  switch (action) {
    case "join":
      return joinBtn(interaction, args[0]!);
    case "rock":
    case "paper":
    case "scissors":
      return choiceBtn(interaction, args[0]!, action as RPSChoice);
    case "cancel":
      return cancelBtn(interaction, args[0]!);
    default:
      log.warn({ action }, "unknown rps action");
  }
}

async function joinBtn(interaction: ButtonInteraction, lobbyId: string): Promise<void> {
  const lobby = getRPSLobby(lobbyId);
  if (!lobby) {
    await interaction.reply({
      embeds: [errorEmbed("اللوبي انتهى | Lobby expired.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.user.id === lobby.hostId) {
    await interaction.reply({
      embeds: [errorEmbed("انت المضيف — انتظر خصم | You're the host — wait for opponent.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member1 = await interaction.guild!.members.fetch(lobby.hostId);
  const member2 = interaction.member!;

  const game = createRPSGame({
    lobbyId: lobby.id,
    guildId: lobby.guildId,
    channelId: lobby.channelId,
    player1: { userId: member1.id, name: member1.displayName },
    player2: { userId: member2.user.id, name: member2.user.username },
    rounds: lobby.rounds,
  });
  destroyRPSLobby(lobbyId);

  await interaction.update({
    content: `🪨 <@${game.player1.userId}> 🆚 <@${game.player2.userId}> ✂️`,
    embeds: [
      gameEmbed(
        `الجولة ${game.currentRound} من ${game.rounds} | Round ${game.currentRound} of ${game.rounds}\n\n${L.rpsChoose}`,
        L.rpsTitle,
        Palette.purple
      ),
    ],
    components: rpsChoiceButtons(game.id),
  });
}

async function cancelBtn(interaction: ButtonInteraction, id: string): Promise<void> {
  destroyRPSLobby(id);
  await interaction.update({
    content: "تم إلغاء اللعبة | Game cancelled.",
    embeds: [],
    components: [],
  });
}

async function choiceBtn(
  interaction: ButtonInteraction,
  gameId: string,
  choice: RPSChoice
): Promise<void> {
  const result = makeRPSChoice(gameId, interaction.user.id, choice);
  if (!result.ok || !result.game) {
    await interaction.reply({
      embeds: [errorEmbed(result.reason ?? "خطأ | Error")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!result.roundDone) {
    await interaction.reply({
      embeds: [successEmbed(`اخترت ${choiceEmoji(choice)} — ${L.rpsWaiting}`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const game = result.game;
  const p1Choice = choiceEmoji(game.player1.choice ?? "rock");
  const p2Choice = choiceEmoji(game.player2.choice ?? "rock");
  const prevRound = game.currentRound - 1 || game.rounds;

  if (game.status === "finished") {
    if (game.winner === "draw") {
      addDraw(game.guildId, [game.player1.userId, game.player2.userId]);
    } else if (game.winner) {
      const loserId = game.winner === game.player1.userId ? game.player2.userId : game.player1.userId;
      addRoundWin(game.guildId, game.winner);
      addLoss(game.guildId, loserId);
    }

    const winnerName = game.winner === "draw"
      ? L.rpsDraw
      : game.winner === game.player1.userId
        ? L.rpsWin(game.player1.name)
        : L.rpsWin(game.player2.name);

    await interaction.update({
      embeds: [
        gameEmbed(
          `الجولة ${prevRound}: ${game.player1.name} ${p1Choice} vs ${p2Choice} ${game.player2.name}\n\n` +
          `النتيجة | Score: **${game.scores.p1}** - **${game.scores.p2}**\n\n` +
          `🏆 ${winnerName}`,
          `${L.rpsTitle} — ${L.c4Finished}`,
          Palette.gold
        ),
      ],
      components: [],
    });
    return;
  }

  await interaction.update({
    embeds: [
      gameEmbed(
        `الجولة ${prevRound}: ${game.player1.name} ${p1Choice} vs ${p2Choice} ${game.player2.name}\n\n` +
        `النتيجة | Score: **${game.scores.p1}** - **${game.scores.p2}**\n\n` +
        `الجولة ${game.currentRound} من ${game.rounds} | Round ${game.currentRound} of ${game.rounds}\n${L.rpsChoose}`,
        L.rpsTitle,
        Palette.purple
      ),
    ],
    components: rpsChoiceButtons(game.id),
  });
}

function rpsChoiceButtons(gameId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${IDS.rps.rock}:${gameId}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel(L.rpsRock)
        .setEmoji("🪨"),
      new ButtonBuilder()
        .setCustomId(`${IDS.rps.paper}:${gameId}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel(L.rpsPaper)
        .setEmoji("📄"),
      new ButtonBuilder()
        .setCustomId(`${IDS.rps.scissors}:${gameId}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel(L.rpsScissors)
        .setEmoji("✂️"),
    ),
  ];
}
