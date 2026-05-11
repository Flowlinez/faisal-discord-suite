import {
  EmbedBuilder,
  type APIEmbedField,
  type EmbedAuthorData,
  type EmbedFooterData,
} from "discord.js";
import { Palette } from "../utils/colors.js";
import { L } from "../utils/locale.js";

export interface BasicEmbedArgs {
  title?: string;
  description?: string;
  color?: number;
  fields?: APIEmbedField[];
  thumbnail?: string;
  image?: string;
  author?: EmbedAuthorData;
  footer?: EmbedFooterData;
  url?: string;
  timestamp?: boolean;
}

export function buildEmbed(args: BasicEmbedArgs): EmbedBuilder {
  const e = new EmbedBuilder().setColor(args.color ?? Palette.primary);
  if (args.title) e.setTitle(args.title);
  if (args.description) e.setDescription(args.description);
  if (args.fields) e.addFields(args.fields);
  if (args.thumbnail) e.setThumbnail(args.thumbnail);
  if (args.image) e.setImage(args.image);
  if (args.author) e.setAuthor(args.author);
  if (args.footer) e.setFooter(args.footer);
  else e.setFooter({ text: `${L.brand} Precision` });
  if (args.url) e.setURL(args.url);
  if (args.timestamp) e.setTimestamp(new Date());
  return e;
}

export function successEmbed(text: string, title = "تم بنجاح | Success"): EmbedBuilder {
  return buildEmbed({
    title: `✅ ${title}`,
    description: text,
    color: Palette.success,
    timestamp: true,
  });
}

export function errorEmbed(text: string, title = "خطأ | Error"): EmbedBuilder {
  return buildEmbed({
    title: `❌ ${title}`,
    description: text,
    color: Palette.danger,
    timestamp: true,
  });
}

export function infoEmbed(text: string, title?: string): EmbedBuilder {
  return buildEmbed({
    title: title ? `ℹ️ ${title}` : undefined,
    description: text,
    color: Palette.info,
  });
}

export function warnEmbed(text: string, title = "تنبيه | Warning"): EmbedBuilder {
  return buildEmbed({
    title: `⚠️ ${title}`,
    description: text,
    color: Palette.warn,
    timestamp: true,
  });
}

export function gameEmbed(text: string, title: string, color?: number): EmbedBuilder {
  return buildEmbed({
    title: `🎮 ${title}`,
    description: text,
    color: color ?? Palette.purple,
    timestamp: true,
  });
}
