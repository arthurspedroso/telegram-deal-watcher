import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Keyword } from "../domain/keyword-filter.js";

export class ConfigError extends Error {
  override name = "ConfigError";
}

export interface TelegramApiConfig {
  readonly apiId: number;
  readonly apiHash: string;
}

export interface AppEnv extends TelegramApiConfig {
  readonly session: string;
  readonly botToken: string;
  readonly notifyChatId: string;
}

export type ChannelSelection =
  | { readonly mode: "all"; readonly ignore: readonly string[] }
  | { readonly mode: "list"; readonly names: readonly string[] };

export interface KeywordsConfig {
  readonly channels: ChannelSelection;
  readonly keywords: readonly Keyword[];
}

const envVar = () => z.string({ error: "faltando no .env" }).trim();

const telegramApiSchema = z.object({
  API_ID: envVar().regex(/^\d+$/, "deve ser um número").transform(Number),
  API_HASH: envVar().regex(/^[0-9a-f]{32}$/i, "deve ter 32 caracteres hexadecimais"),
});

const appEnvSchema = telegramApiSchema.extend({
  TELEGRAM_SESSION: envVar().min(1, "vazio: rode `npm run login` para gerar a sessão"),
  BOT_TOKEN: envVar().regex(/^\d+:[\w-]+$/, "formato esperado: 123456789:ABC..."),
  NOTIFY_CHAT_ID: envVar().regex(/^-?\d+$/, "deve ser um número (o seu id no Telegram)"),
});

const channelNameSchema = z
  .string()
  .trim()
  .transform((channel) => channel.replace(/^@/, ""))
  .pipe(z.string().min(1));

const keywordsConfigSchema = z
  .object({
    channels: z.union([
      z.literal("all"),
      z.array(channelNameSchema).min(1, 'informe pelo menos um canal, ou use "all"'),
    ]),
    ignoreChannels: z.array(channelNameSchema).optional(),
    keywords: z
      .array(
        z.object({
          terms: z.string().trim().min(1),
          exclude: z.array(z.string().trim().min(1)).optional(),
        }),
      )
      .min(1, "informe pelo menos uma palavra-chave"),
  })
  .refine((config) => config.channels === "all" || config.ignoreChannels === undefined, {
    message: 'ignoreChannels só funciona com "channels": "all"',
    path: ["ignoreChannels"],
  })
  .transform(
    ({ channels, ignoreChannels, keywords }): KeywordsConfig => ({
      channels:
        channels === "all" ? { mode: "all", ignore: ignoreChannels ?? [] } : { mode: "list", names: channels },
      keywords,
    }),
  );

function parseWith<T>(schema: z.ZodType<T>, input: unknown, source: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(`Configuração inválida em ${source}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function parseTelegramApiEnv(env: NodeJS.ProcessEnv): TelegramApiConfig {
  const parsed = parseWith(telegramApiSchema, env, ".env");
  return { apiId: parsed.API_ID, apiHash: parsed.API_HASH };
}

export function parseAppEnv(env: NodeJS.ProcessEnv): AppEnv {
  const parsed = parseWith(appEnvSchema, env, ".env");
  return {
    apiId: parsed.API_ID,
    apiHash: parsed.API_HASH,
    session: parsed.TELEGRAM_SESSION,
    botToken: parsed.BOT_TOKEN,
    notifyChatId: parsed.NOTIFY_CHAT_ID,
  };
}

export function parseKeywordsConfig(input: unknown, source = "keywords.json"): KeywordsConfig {
  return parseWith(keywordsConfigSchema, input, source);
}

export async function loadKeywordsConfig(path: string): Promise<KeywordsConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new ConfigError(`Arquivo de palavras-chave não encontrado: ${path}`);
    }
    throw error;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`${path} não é um JSON válido: ${detail}`);
  }

  return parseKeywordsConfig(json, path);
}
