import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  type Guild,
  type GuildMember,
  type Message,
  type VoiceState,
  type VoiceBasedChannel,
} from "discord.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { getGuildSettings } from "../../db/settings.js";
import { createRecording, updateRecording } from "../../db/recordings.js";
import { RollingBuffer } from "./rollingBuffer.js";
import { EventTimeline } from "./eventTimeline.js";
import { joinAndCapture, type VoiceSession } from "./voiceConnection.js";

const log = logger.child({ mod: "rec-mgr" });

export interface ActiveSession {
  id: string;
  guildId: string;
  channelId: string;
  startedBy: string;
  startedAt: number;
  bufferMinutes: number;
  sessionDir: string;
  voice: VoiceSession;
  buffer: RollingBuffer;
  timeline: EventTimeline;
  paused: boolean;
  pausedAt: number | null;
  totalPausedMs: number;
}

class RecordingManager {
  private sessions = new Map<string, ActiveSession>(); // by guildId

  isActive(guildId: string): boolean {
    return this.sessions.has(guildId);
  }

  get(guildId: string): ActiveSession | undefined {
    return this.sessions.get(guildId);
  }

  async start(args: {
    channel: VoiceBasedChannel;
    startedBy: string;
  }): Promise<ActiveSession> {
    if (this.sessions.has(args.channel.guildId)) {
      throw new Error("في تسجيل شغّال فعلاً في السيرفر.");
    }
    const settings = getGuildSettings(args.channel.guildId);
    const id = randomUUID();
    const sessionDir = path.join(env.RECORDINGS_DIR, args.channel.guildId, id);
    fs.mkdirSync(sessionDir, { recursive: true });

    const buffer = new RollingBuffer(sessionDir, settings.max_buffer_minutes);
    buffer.start();
    const timeline = new EventTimeline(buffer.getStartedAt(), settings.max_buffer_minutes);

    const voice = await joinAndCapture({
      channel: args.channel,
      buffer,
      timeline,
      selfDeaf: false,
    });

    const session: ActiveSession = {
      id,
      guildId: args.channel.guildId,
      channelId: args.channel.id,
      startedBy: args.startedBy,
      startedAt: buffer.getStartedAt(),
      bufferMinutes: settings.max_buffer_minutes,
      sessionDir,
      voice,
      buffer,
      timeline,
      paused: false,
      pausedAt: null,
      totalPausedMs: 0,
    };
    this.sessions.set(args.channel.guildId, session);

    createRecording({
      guildId: session.guildId,
      channelId: session.channelId,
      startedBy: session.startedBy,
      kind: "full",
    });

    // Capture initial voice states
    for (const [, member] of args.channel.members) {
      const vs = member.voice;
      if (vs.streaming) timeline.pushVoice({ userId: member.id, kind: "share_start" });
      if (vs.selfVideo) timeline.pushVoice({ userId: member.id, kind: "camera_on" });
      if (vs.selfMute) timeline.pushVoice({ userId: member.id, kind: "self_mute" });
      if (vs.serverMute) timeline.pushVoice({ userId: member.id, kind: "server_mute" });
      timeline.pushVoice({ userId: member.id, kind: "joined" });
    }

    log.info({ guild: session.guildId, channel: session.channelId }, "recording started");
    return session;
  }

  async stop(guildId: string): Promise<ActiveSession | null> {
    const s = this.sessions.get(guildId);
    if (!s) return null;
    try {
      s.voice.cleanup();
    } catch {
      /* ignore */
    }
    s.buffer.stop();
    this.sessions.delete(guildId);
    updateRecording(s.id, {
      stopped_at: Math.floor(Date.now() / 1000),
      duration_seconds: Math.floor((Date.now() - s.startedAt) / 1000),
    });
    log.info({ id: s.id }, "recording stopped");
    return s;
  }

  handleVoiceStateChange(oldState: VoiceState, newState: VoiceState): void {
    const guildId = (newState.guild ?? oldState.guild).id;
    const s = this.sessions.get(guildId);
    if (!s) return;
    if (newState.channelId !== s.channelId && oldState.channelId !== s.channelId) return;
    const userId = newState.id;
    const t = s.timeline;
    // camera
    if (oldState.selfVideo !== newState.selfVideo) {
      t.pushVoice({ userId, kind: newState.selfVideo ? "camera_on" : "camera_off" });
    }
    if (oldState.streaming !== newState.streaming) {
      t.pushVoice({ userId, kind: newState.streaming ? "share_start" : "share_stop" });
    }
    if (oldState.selfMute !== newState.selfMute) {
      t.pushVoice({ userId, kind: newState.selfMute ? "self_mute" : "self_unmute" });
    }
    if (oldState.selfDeaf !== newState.selfDeaf) {
      t.pushVoice({ userId, kind: newState.selfDeaf ? "self_deaf" : "self_undeaf" });
    }
    if (oldState.serverMute !== newState.serverMute) {
      t.pushVoice({ userId, kind: newState.serverMute ? "server_mute" : "server_unmute" });
    }
    if (oldState.channelId !== newState.channelId) {
      if (newState.channelId === s.channelId) t.pushVoice({ userId, kind: "joined" });
      if (oldState.channelId === s.channelId) t.pushVoice({ userId, kind: "left" });
    }
  }

  handleChatMessage(message: Message): void {
    if (!message.guildId) return;
    const s = this.sessions.get(message.guildId);
    if (!s) return;
    // We capture chat in any channel — caller filters later if needed.
    s.timeline.pushChat({
      userId: message.author.id,
      username: (message.member as GuildMember | null)?.displayName ?? message.author.username,
      avatarUrl: message.author.displayAvatarURL({ size: 64, extension: "png" }),
      content: message.cleanContent || "[محتوى غير نصي]",
    });
  }

  /** Snapshot users known so far in this session (with display info). */
  snapshotUsers(s: ActiveSession): { userId: string; username: string; avatarUrl: string }[] {
    return s.buffer.listUsers();
  }

  /** Pause an active recording (voice capture continues but we mark frames as paused). */
  pause(guildId: string): boolean {
    const s = this.sessions.get(guildId);
    if (!s || s.paused) return false;
    s.paused = true;
    s.pausedAt = Date.now();
    log.info({ guild: guildId }, "recording paused");
    return true;
  }

  /** Resume a paused recording. */
  resume(guildId: string): boolean {
    const s = this.sessions.get(guildId);
    if (!s || !s.paused || !s.pausedAt) return false;
    s.totalPausedMs += Date.now() - s.pausedAt;
    s.paused = false;
    s.pausedAt = null;
    log.info({ guild: guildId }, "recording resumed");
    return true;
  }

  /** Get the effective recording duration (excluding paused time). */
  effectiveDuration(guildId: string): number {
    const s = this.sessions.get(guildId);
    if (!s) return 0;
    const totalMs = Date.now() - s.startedAt;
    const pausedMs = s.paused && s.pausedAt ? s.totalPausedMs + (Date.now() - s.pausedAt) : s.totalPausedMs;
    return Math.max(0, Math.floor((totalMs - pausedMs) / 1000));
  }

  /** Force the bot to remain in the channel by attempting a rejoin if disconnected. */
  async ensureJoined(guild: Guild, channelId: string, startedBy: string): Promise<void> {
    if (this.sessions.has(guild.id)) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) return;
    await this.start({ channel, startedBy });
  }

  /** Cleanup old recording directories older than `maxAgeDays`. */
  cleanupOldRecordings(maxAgeDays = 7): number {
    let cleaned = 0;
    const recDir = env.RECORDINGS_DIR;
    if (!fs.existsSync(recDir)) return 0;
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    try {
      for (const guildDir of fs.readdirSync(recDir)) {
        const guildPath = path.join(recDir, guildDir);
        if (!fs.statSync(guildPath).isDirectory()) continue;
        for (const sessionDir of fs.readdirSync(guildPath)) {
          const sessionPath = path.join(guildPath, sessionDir);
          try {
            const stat = fs.statSync(sessionPath);
            if (stat.isDirectory() && stat.mtimeMs < cutoff) {
              fs.rmSync(sessionPath, { recursive: true, force: true });
              cleaned++;
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      log.warn({ err }, "cleanup error");
    }
    if (cleaned > 0) log.info({ cleaned }, "old recordings cleaned up");
    return cleaned;
  }
}

export const recordingManager = new RecordingManager();

// Auto-cleanup old recordings on startup and every 6 hours
recordingManager.cleanupOldRecordings(7);
setInterval(() => recordingManager.cleanupOldRecordings(7), 6 * 60 * 60 * 1000);
