import "dotenv/config";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { watchOffers } from "./application/watch-offers.js";
import { ConfigError, loadKeywordsConfig, parseAppEnv } from "./infrastructure/config.js";
import { connectAsUser } from "./infrastructure/telegram-client.js";
import { TelegramBotNotifier } from "./infrastructure/telegram-notifier.js";
import { TelegramSource } from "./infrastructure/telegram-source.js";

const KEYWORDS_PATH = "keywords.json";

// O padrão de 250 ms para tentar IPv4 antes de IPv6 é curto demais para a latência até o Telegram.
setDefaultAutoSelectFamilyAttemptTimeout(2000);

async function main(): Promise<void> {
  const env = parseAppEnv(process.env);
  const config = await loadKeywordsConfig(KEYWORDS_PATH);

  const notifier = new TelegramBotNotifier(env.botToken, env.notifyChatId);
  try {
    await notifier.sendText("✅ Monitor de promoções iniciado.");
  } catch (error) {
    throw new Error("O bot não conseguiu te mandar mensagem. Confira BOT_TOKEN e NOTIFY_CHAT_ID e se você já mandou /start para o bot.", { cause: error });
  }

  const { client, me } = await connectAsUser(env, env.session);
  console.info(`Conectado como @${me.username ?? me.firstName ?? "?"}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.info(`${signal} recebido, desconectando...`);
    await client.destroy();
    process.exit(0);
  };
  process.once("SIGINT", (signal) => void shutdown(signal));
  process.once("SIGTERM", (signal) => void shutdown(signal));

  const source = new TelegramSource(client, config.channels, console);
  await watchOffers({ source, notifier, keywords: config.keywords, logger: console });

  console.info(`Pronto. ${config.keywords.length} palavra(s)-chave ativa(s).`);
}

try {
  await main();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.cause) console.error("Causa:", error.cause);
  }
  process.exit(1);
}
