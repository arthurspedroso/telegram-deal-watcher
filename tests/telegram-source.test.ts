import { describe, expect, it } from "vitest";
import {
  isWatched,
  pollAction,
  toOffer,
  type ChannelRule,
  type WatchedChannel,
} from "../src/infrastructure/telegram-source.js";

const publicChannel: WatchedChannel = { id: "1001", name: "Pelando", username: "pelando", broadcast: true };
const privateChannel: WatchedChannel = { id: "2002", name: "Ofertas VIP", username: undefined, broadcast: true };
const group: WatchedChannel = { id: "3003", name: "Grupo de promos", username: "grupopromos", broadcast: false };

describe("toOffer", () => {
  it("converte mensagem de canal público com link pelo username", () => {
    expect(toOffer({ id: 42, message: "Monitor Odyssey G5" }, publicChannel)).toEqual({
      text: "Monitor Odyssey G5",
      channel: "pelando",
      messageId: 42,
      link: "https://t.me/pelando/42",
    });
  });

  it("usa link t.me/c e o título para canal sem username", () => {
    const offer = toOffer({ id: 7, message: "Promo" }, privateChannel);

    expect(offer?.link).toBe("https://t.me/c/2002/7");
    expect(offer?.channel).toBe("Ofertas VIP");
  });

  it("ignora mensagem sem texto (ex.: só imagem)", () => {
    expect(toOffer({ id: 1, message: "   " }, publicChannel)).toBeUndefined();
  });

  it("ignora mensagem de serviço, que não tem o campo de texto", () => {
    expect(toOffer({ id: 2 }, publicChannel)).toBeUndefined();
    expect(toOffer({ id: 3, message: undefined }, publicChannel)).toBeUndefined();
  });
});

describe("isWatched", () => {
  describe('modo "all"', () => {
    const rule: ChannelRule = { mode: "all", ignoredUsernames: new Set(["noticias"]) };

    it("aceita qualquer canal", () => {
      expect(isWatched(publicChannel, rule)).toBe(true);
      expect(isWatched(privateChannel, rule)).toBe(true);
    });

    it("recusa grupos", () => {
      expect(isWatched(group, rule)).toBe(false);
    });

    it("recusa canais ignorados, sem diferenciar maiúsculas", () => {
      const news: WatchedChannel = { id: "4004", name: "Notícias", username: "Noticias", broadcast: true };
      expect(isWatched(news, rule)).toBe(false);
    });
  });

  describe('modo "list"', () => {
    const rule: ChannelRule = { mode: "list", ids: new Set(["1001", "3003"]) };

    it("aceita só os canais da lista, inclusive grupos listados", () => {
      expect(isWatched(publicChannel, rule)).toBe(true);
      expect(isWatched(group, rule)).toBe(true);
      expect(isWatched(privateChannel, rule)).toBe(false);
    });
  });
});

describe("pollAction", () => {
  it("canal visto pela primeira vez só registra a última mensagem, sem buscar histórico", () => {
    expect(pollAction(undefined, 500)).toBe("seed");
  });

  it("busca quando há mensagem mais nova que a última vista", () => {
    expect(pollAction(500, 503)).toBe("fetch");
  });

  it("não faz nada quando não há mensagem nova", () => {
    expect(pollAction(503, 503)).toBe("skip");
    expect(pollAction(503, 500)).toBe("skip");
  });
});
