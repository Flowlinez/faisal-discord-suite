import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Snowflake,
} from "discord.js";
import { IDS } from "../../utils/ids.js";
import { L } from "../../utils/locale.js";

export interface C4Lobby {
  id: string;
  guildId: string;
  channelId: string;
  hostId: Snowflake;
  joiners: Snowflake[];
  startedAt: number;
}

const lobbies = new Map<string, C4Lobby>();

export function createC4Lobby(args: {
  id: string;
  guildId: string;
  channelId: string;
  hostId: string;
}): C4Lobby {
  const l: C4Lobby = {
    id: args.id,
    guildId: args.guildId,
    channelId: args.channelId,
    hostId: args.hostId,
    joiners: [args.hostId],
    startedAt: Date.now(),
  };
  lobbies.set(l.id, l);
  return l;
}

export function getC4Lobby(id: string): C4Lobby | undefined {
  return lobbies.get(id);
}

export function destroyC4Lobby(id: string): void {
  lobbies.delete(id);
}

export function joinC4Lobby(id: string, userId: string): C4Lobby | null {
  const l = lobbies.get(id);
  if (!l) return null;
  if (l.joiners.includes(userId)) return l;
  l.joiners.push(userId);
  return l;
}

export function c4LobbyRow(id: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${IDS.c4.join}:${id}`)
      .setStyle(ButtonStyle.Success)
      .setLabel(L.c4Join)
      .setEmoji("🟡"),
    new ButtonBuilder()
      .setCustomId(`${IDS.c4.cancel}:${id}`)
      .setStyle(ButtonStyle.Danger)
      .setLabel(L.c4Cancel)
      .setEmoji("✖️")
  );
}
