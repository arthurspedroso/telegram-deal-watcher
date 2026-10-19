import { Logger, TelegramClient } from "telegram";
import { LogLevel } from "telegram/extensions/Logger.js";
import { StringSession } from "telegram/sessions/index.js";
import type { Api } from "telegram/tl/index.js";
import type { TelegramApiConfig } from "./config.js";

export function createTelegramClient(api: TelegramApiConfig, session: StringSession): TelegramClient {
  return new TelegramClient(session, api.apiId, api.apiHash, {
    connectionRetries: 10,
    retryDelay: 2000,
    autoReconnect: true,
    floodSleepThreshold: 300,
    baseLogger: new Logger(LogLevel.WARN),
  });
}

export interface ConnectedUser {
  readonly client: TelegramClient;
  readonly me: Api.User;
}

export async function connectAsUser(api: TelegramApiConfig, session: string): Promise<ConnectedUser> {
  const client = createTelegramClient(api, new StringSession(session));
  await client.connect();

  if (!(await client.checkAuthorization())) {
    await client.destroy();
    throw new Error("Sessão do Telegram inválida ou expirada. Rode `npm run login` e atualize o TELEGRAM_SESSION no .env.");
  }

  const me = await client.getMe();
  return { client, me };
}
