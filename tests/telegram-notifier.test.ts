import { describe, expect, it } from "vitest";
import type { Keyword } from "../src/domain/keyword-filter.js";
import type { Offer } from "../src/domain/offer.js";
import { formatNotification, TelegramBotNotifier } from "../src/infrastructure/telegram-notifier.js";

const keyword: Keyword = { terms: "odyssey g5 27" };
const offer: Offer = {
  text: "Monitor Odyssey G5 27 por R$ 1.299",
  channel: "pelando",
  messageId: 42,
  link: "https://t.me/pelando/42",
};

interface Call {
  readonly url: string;
  readonly body: unknown;
}

function fakeFetch(responses: { status: number; body: unknown }[]): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    const next = responses.shift();
    if (!next) throw new Error("fakeFetch sem respostas sobrando");
    return new Response(JSON.stringify(next.body), { status: next.status });
  };
  return { fetchFn, calls };
}

describe("formatNotification", () => {
  it("mostra a palavra-chave, o canal, o texto e o link", () => {
    const message = formatNotification(offer, keyword);

    expect(message).toContain("odyssey g5 27");
    expect(message).toContain("pelando");
    expect(message).toContain(offer.text);
    expect(message).toContain("https://t.me/pelando/42");
  });

  it("funciona sem link", () => {
    const { link: _, ...withoutLink } = offer;
    expect(formatNotification(withoutLink, keyword)).not.toContain("https://");
  });

  it("corta textos muito longos para caber no limite do Telegram", () => {
    const longOffer = { ...offer, text: "a".repeat(10_000) };
    expect(formatNotification(longOffer, keyword).length).toBeLessThan(4096);
  });
});

describe("TelegramBotNotifier", () => {
  it("envia para o chat configurado pela Bot API", async () => {
    const { fetchFn, calls } = fakeFetch([{ status: 200, body: { ok: true } }]);
    const notifier = new TelegramBotNotifier("123:abc", "999", fetchFn);

    await notifier.notify(offer, keyword);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(calls[0]?.body).toMatchObject({ chat_id: "999", text: formatNotification(offer, keyword) });
  });

  it("lança erro com a descrição quando a Bot API recusa", async () => {
    const { fetchFn } = fakeFetch([
      { status: 403, body: { ok: false, description: "Forbidden: bot can't initiate conversation with a user" } },
    ]);
    const notifier = new TelegramBotNotifier("123:abc", "999", fetchFn);

    await expect(notifier.notify(offer, keyword)).rejects.toThrow(/can't initiate conversation/);
  });

  it("espera e tenta de novo quando recebe limite de requisições (429)", async () => {
    const { fetchFn, calls } = fakeFetch([
      { status: 429, body: { ok: false, description: "Too Many Requests", parameters: { retry_after: 0 } } },
      { status: 200, body: { ok: true } },
    ]);
    const notifier = new TelegramBotNotifier("123:abc", "999", fetchFn);

    await notifier.notify(offer, keyword);

    expect(calls).toHaveLength(2);
  });

  it("tenta de novo quando a rede falha", async () => {
    let calls = 0;
    const flakyFetch: typeof fetch = async () => {
      calls++;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const notifier = new TelegramBotNotifier("123:abc", "999", flakyFetch, 0);

    await notifier.notify(offer, keyword);

    expect(calls).toBe(2);
  });

  it("desiste depois de 3 falhas de rede", async () => {
    let calls = 0;
    const deadFetch: typeof fetch = async () => {
      calls++;
      throw new TypeError("fetch failed");
    };
    const notifier = new TelegramBotNotifier("123:abc", "999", deadFetch, 0);

    await expect(notifier.notify(offer, keyword)).rejects.toThrow(/Sem conexão/);
    expect(calls).toBe(3);
  });

  it("desiste depois de 3 tentativas com 429", async () => {
    const tooMany = { status: 429, body: { ok: false, parameters: { retry_after: 0 } } };
    const { fetchFn, calls } = fakeFetch([tooMany, tooMany, tooMany, tooMany]);
    const notifier = new TelegramBotNotifier("123:abc", "999", fetchFn);

    await expect(notifier.notify(offer, keyword)).rejects.toThrow(/429/);
    expect(calls).toHaveLength(3);
  });
});
