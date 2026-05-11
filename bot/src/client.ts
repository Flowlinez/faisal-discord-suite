import {
  ActivityType,
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  type ChatInputCommandInteraction,
  type Interaction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

export interface SlashCommand {
  data: {
    name: string;
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
  };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface InteractionHandler {
  match(interaction: Interaction): boolean;
  handle(interaction: Interaction): Promise<void>;
}

declare module "discord.js" {
  interface Client {
    commands: Collection<string, SlashCommand>;
    interactionHandlers: InteractionHandler[];
  }
}

export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User],
    presence: {
      status: "online",
      activities: [
        {
          name: "✦",
          type: ActivityType.Streaming,
          url: "https://twitch.tv/discord", // any valid twitch URL activates the purple "streaming" indicator
        },
      ],
    },
  });

  client.commands = new Collection<string, SlashCommand>();
  client.interactionHandlers = [];

  client.on("error", (err) => logger.error({ err }, "client error"));
  client.on("warn", (msg) => logger.warn({ msg }, "client warn"));
  client.on("shardError", (err, shard) =>
    logger.error({ err, shard }, "shard error")
  );
  client.on("shardReconnecting", (shard) =>
    logger.warn({ shard }, "shard reconnecting")
  );
  client.on("shardDisconnect", (event, shard) =>
    logger.warn({ event, shard }, "shard disconnected")
  );

  // Just to use env without lint warning on import
  void env.DISCORD_APP_ID;
  return client;
}
