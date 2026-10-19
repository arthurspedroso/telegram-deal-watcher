export interface Offer {
  readonly text: string;
  readonly channel: string;
  readonly messageId: number;
  readonly link?: string;
}

export function offerKey(offer: Offer): string {
  return `${offer.channel}:${offer.messageId}`;
}
