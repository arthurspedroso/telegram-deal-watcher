import type { Keyword } from "../domain/keyword-filter.js";
import type { Offer } from "../domain/offer.js";

export type OfferHandler = (offer: Offer) => Promise<void>;

export interface OfferSource {
  start(onOffer: OfferHandler): Promise<void>;
}

export interface Notifier {
  notify(offer: Offer, keyword: Keyword): Promise<void>;
}

export interface Logger {
  info(message: string): void;
  error(message: string, error: unknown): void;
}
