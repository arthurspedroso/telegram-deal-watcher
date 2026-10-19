import { beforeEach, describe, expect, it } from "vitest";
import type { Logger, Notifier, OfferHandler, OfferSource } from "../src/application/ports.js";
import { watchOffers } from "../src/application/watch-offers.js";
import type { Keyword } from "../src/domain/keyword-filter.js";
import type { Offer } from "../src/domain/offer.js";

class FakeSource implements OfferSource {
  private handler: OfferHandler | undefined;

  async start(onOffer: OfferHandler): Promise<void> {
    this.handler = onOffer;
  }

  async emit(offer: Offer): Promise<void> {
    if (!this.handler) throw new Error("FakeSource não foi iniciado");
    await this.handler(offer);
  }
}

class FakeNotifier implements Notifier {
  readonly sent: { offer: Offer; keyword: Keyword }[] = [];
  failNext = false;

  async notify(offer: Offer, keyword: Keyword): Promise<void> {
    await Promise.resolve();
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Telegram fora do ar");
    }
    this.sent.push({ offer, keyword });
  }
}

class FakeLogger implements Logger {
  readonly infos: string[] = [];
  readonly errors: string[] = [];

  info(message: string): void {
    this.infos.push(message);
  }

  error(message: string): void {
    this.errors.push(message);
  }
}

const odyssey: Keyword = { terms: "odyssey g5 27", exclude: ["oled"] };

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return { text: "Monitor Odyssey G5 27 QHD", channel: "pelando", messageId: 1, ...overrides };
}

describe("watchOffers", () => {
  let source: FakeSource;
  let notifier: FakeNotifier;
  let logger: FakeLogger;

  beforeEach(async () => {
    source = new FakeSource();
    notifier = new FakeNotifier();
    logger = new FakeLogger();
    await watchOffers({ source, notifier, keywords: [odyssey], logger });
  });

  it("notifica oferta que bate com uma palavra-chave, dizendo qual bateu", async () => {
    const offer = makeOffer();
    await source.emit(offer);

    expect(notifier.sent).toEqual([{ offer, keyword: odyssey }]);
    expect(logger.infos).toHaveLength(1);
  });

  it("ignora oferta que não bate", async () => {
    await source.emit(makeOffer({ text: "Air fryer em promoção" }));
    await source.emit(makeOffer({ text: "Odyssey G5 27 OLED", messageId: 2 }));

    expect(notifier.sent).toHaveLength(0);
  });

  it("não notifica a mesma mensagem duas vezes", async () => {
    await source.emit(makeOffer());
    await source.emit(makeOffer());

    expect(notifier.sent).toHaveLength(1);
  });

  it("mesmo id em canais diferentes são ofertas diferentes", async () => {
    await source.emit(makeOffer({ channel: "pelando" }));
    await source.emit(makeOffer({ channel: "outro_canal" }));

    expect(notifier.sent).toHaveLength(2);
  });

  it("não notifica duas vezes quando a mesma mensagem chega ao mesmo tempo", async () => {
    await Promise.all([source.emit(makeOffer()), source.emit(makeOffer())]);

    expect(notifier.sent).toHaveLength(1);
  });

  it("falha no envio não derruba o fluxo e é registrada no log", async () => {
    notifier.failNext = true;

    await expect(source.emit(makeOffer())).resolves.toBeUndefined();
    expect(logger.errors).toHaveLength(1);
    expect(notifier.sent).toHaveLength(0);
  });

  it("depois de uma falha, a mesma mensagem pode ser notificada de novo", async () => {
    notifier.failNext = true;
    await source.emit(makeOffer());
    await source.emit(makeOffer());

    expect(notifier.sent).toHaveLength(1);
  });
});
