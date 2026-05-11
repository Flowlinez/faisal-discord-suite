/**
 * Standalone script to (re)deploy all slash commands.
 * Usage: npm run -w bot deploy-commands
 *
 * Reads DEFAULT_GUILD_ID — if set, deploys guild commands (fast).
 * If empty, deploys global commands (may take up to 1h to propagate).
 */
import { REST, Routes } from "discord.js";
import { env } from "../config/env.js";
import { setupCommand } from "../commands/setup.js";
import { recordCommand } from "../commands/record.js";
import { clipCommand } from "../commands/clip.js";
import { xoCommand } from "../commands/xo.js";
import { connect4Command } from "../commands/connect4.js";
import { rpsCommand } from "../commands/rps.js";
import { pointsCommand } from "../commands/points.js";
import { soundboardCommand } from "../commands/soundboard.js";
import { vipCommand } from "../commands/vip.js";
import { helpCommand } from "../commands/help.js";
import { rgnCommand } from "../commands/rgn.js";
import { voicefixCommand } from "../commands/voicefix.js";

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
const body = [
  setupCommand,
  recordCommand,
  clipCommand,
  xoCommand,
  connect4Command,
  rpsCommand,
  pointsCommand,
  soundboardCommand,
  vipCommand,
  helpCommand,
  rgnCommand,
  voicefixCommand,
].map((c) => c.data.toJSON());

(async () => {
  try {
    if (env.DEFAULT_GUILD_ID) {
      const data = await rest.put(
        Routes.applicationGuildCommands(env.DISCORD_APP_ID, env.DEFAULT_GUILD_ID),
        { body }
      );
      console.log(`deployed ${(data as unknown[]).length} guild commands`);
    } else {
      const data = await rest.put(
        Routes.applicationCommands(env.DISCORD_APP_ID),
        { body }
      );
      console.log(`deployed ${(data as unknown[]).length} global commands`);
    }
  } catch (err) {
    console.error("deploy failed", err);
    process.exit(1);
  }
})();
