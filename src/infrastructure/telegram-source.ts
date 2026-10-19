import { setTimeout as sleep } from "node:timers/promises";
import { Api, type TelegramClient } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js";
import type { Logger, OfferHandler, OfferSource } from "../application/ports.js";
import type { Offer } from "../domain/offer.js";
import type { ChannelSelection } from "./config.js";

const MAX_MESSAGES_PER_POLL = 100;

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

export type PollAction = "seed" | "skip" | "fetch";

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

export function pollAction(lastSeenId: number | undefined, topMessageId: number): PollAction {
  if (lastSeenId === undefined) return "seed";
  return topMessageId > lastSeenId ? "fetch" : "skip";
}

export interface TelegramSourceOptions {
  readonly pollIntervalMs: number;
}

export class TelegramSource implements OfferSource {
  private readonly lastSeenIds = new Map<string, number>();

  constructor(
    private readonly client: TelegramClient,
    private readonly selection: ChannelSelection,
    private readonly logger: Logger,
    private readonly options: TelegramSourceOptions,
  ) {}

  async start(onOffer: OfferHandler): Promise<void> {
    const rule = await this.buildRule();
    await this.poll(rule, onOffer);
    this.logStartup(rule);

    this.listenToPushedMessages(rule, onOffer);
    void this.pollForever(rule, onOffer);
  }

  private listenToPushedMessages(rule: ChannelRule, onOffer: OfferHandler): void {
    this.client.addEventHandler(async (event: NewMessageEvent) => {
      try {
        const { id, peerId } = event.message;
        if (!(peerId instanceof Api.PeerChannel)) return;

        const chat = await event.message.getChat();
        if (!(chat instanceof Api.Channel)) return;

        const channel = toWatchedChannel(chat);
        if (!isWatched(channel, rule)) return;

        this.markSeen(channel.id, id);
        await this.handleMessage(event.message, channel, onOffer);
      } catch (error) {
        this.logger.error("Erro ao processar mensagem recebida", error);
      }
    }, new NewMessage({}));
  }

  private async pollForever(rule: ChannelRule, onOffer: OfferHandler): Promise<void> {
    for (;;) {
      await sleep(this.options.pollIntervalMs);
      try {
        await this.poll(rule, onOffer);
      } catch (error) {
        this.logger.error("Erro ao verificar os canais", error);
      }
    }
  }

  private async poll(rule: ChannelRule, onOffer: OfferHandler): Promise<void> {
    const dialogs = await this.client.getDialogs({});

    for (const dialog of dialogs) {
      const { entity } = dialog;
      if (!(entity instanceof Api.Channel)) continue;

      const channel = toWatchedChannel(entity);
      if (!isWatched(channel, rule)) continue;

      const lastSeenId = this.lastSeenIds.get(channel.id);
      const topMessageId = dialog.message?.id ?? 0;
      const action = pollAction(lastSeenId, topMessageId);

      if (action === "seed") {
        this.lastSeenIds.set(channel.id, topMessageId);
        continue;
      }
      if (action === "skip") continue;

      const messages = await this.client.getMessages(entity, {
        minId: lastSeenId,
        limit: MAX_MESSAGES_PER_POLL,
      });
      const oldestFirst = [...messages].sort((a, b) => a.id - b.id);
      for (const message of oldestFirst) {
        await this.handleMessage(message, channel, onOffer);
      }
      this.markSeen(channel.id, topMessageId);
    }
  }

  private async handleMessage(message: Api.Message, channel: WatchedChannel, onOffer: OfferHandler): Promise<void> {
    const offer = toOffer(message, channel);
    if (offer) await onOffer(offer);
  }

  private markSeen(channelId: string, messageId: number): void {
    const current = this.lastSeenIds.get(channelId) ?? 0;
    if (messageId > current) this.lastSeenIds.set(channelId, messageId);
  }

  private logStartup(rule: ChannelRule): void {
    const seconds = this.options.pollIntervalMs / 1000;
    const count = this.lastSeenIds.size;
    if (rule.mode === "list") {
      this.logger.info(`Monitorando ${count} canal(is) da lista, verificando a cada ${seconds}s`);
    } else {
      this.logger.info(
        `Monitorando todos os canais que você segue: ${count} agora, verificando a cada ${seconds}s. Canais novos entram automaticamente.`,
      );
    }
  }

  private async buildRule(): Promise<ChannelRule> {
    if (this.selection.mode === "all") {
      return { mode: "all", ignoredUsernames: new Set(this.selection.ignore.map((name) => name.toLowerCase())) };
    }
    const channels = await this.resolveChannels(this.selection.names);
    return { mode: "list", ids: new Set(channels.map((channel) => channel.id.toString())) };
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
