import { env } from "./config/env.js";
import { createClient } from "./client.js";
import { logger } from "./utils/logger.js";
import { db } from "./db/database.js";
import { registerAllCommands } from "./commands/index.js";
import { registerAllEvents } from "./events/index.js";
import { initStayConnected } from "./modules/stayConnected/index.js";
import { ensureCompanion } from "./modules/companion/client.js";

async function main(): Promise<void> {
  logger.info("starting bot…");
  db(); // initialize sqlite + run migrations

  const client = createClient();
  await registerAllCommands(client);
  await registerAllEvents(client);
  initStayConnected(client);
  ensureCompanion(); // best-effort connect to optional companion app

  client.once("ready", (c) => {
    logger.info(
      { user: c.user.tag, guilds: c.guilds.cache.size },
      "✅ bot ready"
    );
  });

  await client.login(env.DISCORD_TOKEN);

  // graceful shutdown
  const shutdown = async (sig: string) => {
    logger.warn({ sig }, "shutting down");
    try {
      client.destroy();
    } catch (err) {
      logger.error({ err }, "error during shutdown");
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection");
  });
}

void main();
