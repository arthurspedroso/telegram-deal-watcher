import "dotenv/config";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { StringSession } from "telegram/sessions/index.js";
import { ConfigError, parseTelegramApiEnv } from "./infrastructure/config.js";
import { createTelegramClient } from "./infrastructure/telegram-client.js";

async function login(): Promise<void> {
  const api = parseTelegramApiEnv(process.env);
  const session = new StringSession("");
  const client = createTelegramClient(api, session);
  const rl = createInterface({ input, output });

  try {
    await client.start({
      phoneNumber: () => rl.question("Telefone com DDI (ex.: +5511999999999): "),
      phoneCode: () => rl.question("Código que chegou no app do Telegram: "),
      password: () => rl.question("Senha da verificação em duas etapas: "),
      onError: (error) => {
        console.error(`Erro: ${error.message}. Tente de novo.`);
      },
    });

    const me = await client.getMe();
    console.log(`\nLogado como ${me.firstName ?? ""} (@${me.username ?? "sem username"}).`);
    console.log("Copie a linha abaixo para o seu .env. Ela dá acesso total à sua conta: não compartilhe.\n");
    console.log(`TELEGRAM_SESSION=${session.save()}`);
  } finally {
    rl.close();
    await client.destroy();
  }
}

try {
  await login();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
