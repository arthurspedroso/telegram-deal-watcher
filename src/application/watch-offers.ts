import { findMatchingKeyword, type Keyword } from "../domain/keyword-filter.js";
import { offerKey, type Offer } from "../domain/offer.js";
import type { Logger, Notifier, OfferSource } from "./ports.js";

export interface WatchOffersDeps {
  readonly source: OfferSource;
  readonly notifier: Notifier;
  readonly keywords: readonly Keyword[];
  readonly logger: Logger;
}

export function watchOffers({ source, notifier, keywords, logger }: WatchOffersDeps): Promise<void> {
  const notified = new Set<string>();

  async function handleOffer(offer: Offer): Promise<void> {
    const keyword = findMatchingKeyword(offer.text, keywords);
    if (!keyword) return;

    const key = offerKey(offer);
    if (notified.has(key)) return;
    notified.add(key);

    try {
      await notifier.notify(offer, keyword);
      logger.info(`Notificado ${key} (palavra-chave: "${keyword.terms}")`);
    } catch (error) {
      notified.delete(key);
      logger.error(`Falha ao notificar ${key}`, error);
    }
  }

  return source.start(handleOffer);
}
