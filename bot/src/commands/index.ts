import type { Client } from "discord.js";
import { logger } from "../utils/logger.js";
import { setupCommand } from "./setup.js";
import { recordCommand } from "./record.js";
import { clipCommand } from "./clip.js";
import { xoCommand } from "./xo.js";
import { connect4Command } from "./connect4.js";
import { rpsCommand } from "./rps.js";
import { pointsCommand } from "./points.js";
import { soundboardCommand } from "./soundboard.js";
import { vipCommand } from "./vip.js";
import { helpCommand } from "./help.js";
import { accountCommand } from "./account.js";
import { voiceCommand } from "./voice.js";
import { shareCommand } from "./share.js";
import { cameraCommand } from "./camera.js";
import { rgnCommand } from "./rgn.js";
import { voicefixCommand } from "./voicefix.js";

export async function registerAllCommands(client: Client): Promise<void> {
  const all = [
    setupCommand,
    recordCommand,
    clipCommand,
    xoCommand,
    connect4Command,
    rpsCommand,
    pointsCommand,
    soundboardCommand,
    vipCommand,
    accountCommand,
    voiceCommand,
    shareCommand,
    cameraCommand,
    rgnCommand,
    voicefixCommand,
    helpCommand,
  ];
  for (const cmd of all) {
    client.commands.set(cmd.data.name, cmd);
  }
  logger.info({ count: all.length }, "commands registered");
}
