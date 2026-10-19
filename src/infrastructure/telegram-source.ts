import { Api, type TelegramClient } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js";
import type { Logger, OfferHandler, OfferSource } from "../application/ports.js";
import type { Offer } from "../domain/offer.js";
import type { ChannelSelection } from "./config.js";

export interface WatchedChannel {
  readonly id: string;
  readonly name: string;
  readonly username: string | undefined;
  readonly broadcast: boolean;
}

export interface IncomingMessage {
  readonly id: number;
  readonly message: string;
}

export type ChannelRule =
  | { readonly mode: "all"; readonly ignoredUsernames: ReadonlySet<string> }
  | { readonly mode: "list"; readonly ids: ReadonlySet<string> };

export function isWatched(channel: WatchedChannel, rule: ChannelRule): boolean {
  if (rule.mode === "list") return rule.ids.has(channel.id);
  if (!channel.broadcast) return false;
  return !(channel.username && rule.ignoredUsernames.has(channel.username.toLowerCase()));
}

export function toOffer(message: IncomingMessage, channel: WatchedChannel): Offer | undefined {
  const text = message.message.trim();
  if (text.length === 0) return undefined;

  const link = channel.username
    ? `https://t.me/${channel.username}/${message.id}`
    : `https://t.me/c/${channel.id}/${message.id}`;

  return { text, channel: channel.username ?? channel.name, messageId: message.id, link };
}

export class TelegramSource implements OfferSource {
  constructor(
    private readonly client: TelegramClient,
    private readonly selection: ChannelSelection,
    private readonly logger: Logger,
  ) {}

  async start(onOffer: OfferHandler): Promise<void> {
    const rule = await this.buildRule();

    this.client.addEventHandler(async (event: NewMessageEvent) => {
      try {
        if (!(event.message.peerId instanceof Api.PeerChannel)) return;

        const chat = await event.message.getChat();
        if (!(chat instanceof Api.Channel)) return;

        const channel = toWatchedChannel(chat);
        if (!isWatched(channel, rule)) return;

        const offer = toOffer(event.message, channel);
        if (offer) await onOffer(offer);
      } catch (error) {
        this.logger.error("Erro ao processar mensagem recebida", error);
      }
    }, new NewMessage({}));
  }

  private async buildRule(): Promise<ChannelRule> {
    if (this.selection.mode === "list") {
      const channels = await this.resolveChannels(this.selection.names);
      this.logger.info(`Monitorando ${channels.length} canal(is): ${channels.map((c) => c.title).join(", ")}`);
      return { mode: "list", ids: new Set(channels.map((channel) => channel.id.toString())) };
    }

    const ignoredUsernames = new Set(this.selection.ignore.map((name) => name.toLowerCase()));
    const followed = await this.followedChannels();
    const watched = followed.filter((channel) => isWatched(toWatchedChannel(channel), { mode: "all", ignoredUsernames }));
    this.logger.info(
      `Monitorando todos os canais que você segue: ${watched.length} agora (${followed.length - watched.length} ignorado[s]). Canais novos entram automaticamente.`,
    );
    return { mode: "all", ignoredUsernames };
  }

  private async followedChannels(): Promise<Api.Channel[]> {
    const dialogs = await this.client.getDialogs({});
    return dialogs
      .map((dialog) => dialog.entity)
      .filter((entity): entity is Api.Channel => entity instanceof Api.Channel && Boolean(entity.broadcast));
  }

  private async resolveChannels(names: readonly string[]): Promise<Api.Channel[]> {
    const resolved: Api.Channel[] = [];
    for (const name of names) {
      const entity = await this.client.getEntity(name).catch((error: unknown) => {
        throw new Error(`Canal "${name}" não encontrado no Telegram. Confira o keywords.json.`, { cause: error });
      });
      if (!(entity instanceof Api.Channel)) {
        throw new Error(`"${name}" não é um canal. Confira o keywords.json.`);
      }
      if (entity.left) {
        throw new Error(`Você não participa do canal "${name}". Entre nele pelo app do Telegram.`);
      }
      resolved.push(entity);
    }
    return resolved;
  }
}

function toWatchedChannel(entity: Api.Channel): WatchedChannel {
  return {
    id: entity.id.toString(),
    name: entity.title,
    username: entity.username,
    broadcast: Boolean(entity.broadcast),
  };
}
