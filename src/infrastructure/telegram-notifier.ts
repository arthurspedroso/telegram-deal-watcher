import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import type { Notifier } from "../application/ports.js";
import type { Keyword } from "../domain/keyword-filter.js";
import type { Offer } from "../domain/offer.js";

const MAX_TEXT_LENGTH = 3500;
const MAX_ATTEMPTS = 3;
const NETWORK_RETRY_DELAY_MS = 2000;

const botApiResponseSchema = z.object({
  ok: z.boolean(),
  description: z.string().optional(),
  parameters: z.object({ retry_after: z.number().optional() }).optional(),
});

export function formatNotification(offer: Offer, keyword: Keyword): string {
  const text =
    offer.text.length > MAX_TEXT_LENGTH ? `${offer.text.slice(0, MAX_TEXT_LENGTH)}…` : offer.text;

  const lines = [`🔔 ${keyword.terms}`, `📢 ${offer.channel}`, "", text];
  if (offer.link) lines.push("", offer.link);
  return lines.join("\n");
}

export class TelegramBotNotifier implements Notifier {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly networkRetryDelayMs = NETWORK_RETRY_DELAY_MS,
  ) {}

  async notify(offer: Offer, keyword: Keyword): Promise<void> {
    await this.sendText(formatNotification(offer, keyword));
  }

  async sendText(text: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchFn(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: this.chatId, text }),
        });
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) {
          throw new Error(`Sem conexão com a Bot API após ${MAX_ATTEMPTS} tentativas`, { cause: error });
        }
        await sleep(this.networkRetryDelayMs);
        continue;
      }

      const body = botApiResponseSchema.parse(await response.json());
      if (body.ok) return;

      const retryAfter = body.parameters?.retry_after;
      if (response.status === 429 && retryAfter !== undefined && attempt < MAX_ATTEMPTS) {
        await sleep(retryAfter * 1000);
        continue;
      }

      throw new Error(`Bot API recusou a mensagem (${response.status}): ${body.description ?? "sem descrição"}`);
    }
  }
}
