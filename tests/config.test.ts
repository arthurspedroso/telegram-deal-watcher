import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ConfigError,
  loadKeywordsConfig,
  parseAppEnv,
  parseKeywordsConfig,
  parseTelegramApiEnv,
} from "../src/infrastructure/config.js";

const validEnv = {
  API_ID: "1234567",
  API_HASH: "0123456789abcdef0123456789abcdef",
  TELEGRAM_SESSION: "1BQANOTEuMTA4LjU2LjE1N...",
  BOT_TOKEN: "123456789:AAH-abc_def",
  NOTIFY_CHAT_ID: "987654321",
};

describe("parseAppEnv", () => {
  it("lê e converte um .env válido", () => {
    expect(parseAppEnv(validEnv)).toEqual({
      apiId: 1234567,
      apiHash: "0123456789abcdef0123456789abcdef",
      session: "1BQANOTEuMTA4LjU2LjE1N...",
      botToken: "123456789:AAH-abc_def",
      notifyChatId: "987654321",
    });
  });

  it("falha com ConfigError quando falta uma variável, dizendo qual", () => {
    const { BOT_TOKEN: _, ...withoutToken } = validEnv;
    expect(() => parseAppEnv(withoutToken)).toThrow(ConfigError);
    expect(() => parseAppEnv(withoutToken)).toThrow(/BOT_TOKEN/);
  });

  it("rejeita API_ID que não é número", () => {
    expect(() => parseAppEnv({ ...validEnv, API_ID: "abc" })).toThrow(/API_ID/);
  });

  it("rejeita sessão vazia com dica de como gerar", () => {
    expect(() => parseAppEnv({ ...validEnv, TELEGRAM_SESSION: "  " })).toThrow(/npm run login/);
  });
});

describe("parseTelegramApiEnv", () => {
  it("só exige API_ID e API_HASH (usado pelo login)", () => {
    const env = { API_ID: validEnv.API_ID, API_HASH: validEnv.API_HASH };
    expect(parseTelegramApiEnv(env)).toEqual({ apiId: 1234567, apiHash: validEnv.API_HASH });
  });
});

describe("parseKeywordsConfig", () => {
  it("aceita um arquivo válido e tira o @ dos canais", () => {
    const config = parseKeywordsConfig({
      channels: ["@pelando", " ofertas_hw "],
      keywords: [{ terms: "odyssey g5 27", exclude: ["oled"] }, { terms: "monitor qhd" }],
    });

    expect(config.channels).toEqual({ mode: "list", names: ["pelando", "ofertas_hw"] });
    expect(config.keywords).toHaveLength(2);
  });

  it('aceita "all" com lista de canais ignorados', () => {
    const config = parseKeywordsConfig({
      channels: "all",
      ignoreChannels: ["@noticias"],
      keywords: [{ terms: "monitor" }],
    });

    expect(config.channels).toEqual({ mode: "all", ignore: ["noticias"] });
  });

  it('"all" sem ignoreChannels não ignora nada', () => {
    const config = parseKeywordsConfig({ channels: "all", keywords: [{ terms: "monitor" }] });

    expect(config.channels).toEqual({ mode: "all", ignore: [] });
  });

  it('rejeita ignoreChannels junto com lista de canais', () => {
    expect(() =>
      parseKeywordsConfig({ channels: ["pelando"], ignoreChannels: ["x"], keywords: [{ terms: "m" }] }),
    ).toThrow(/ignoreChannels/);
  });

  it("rejeita texto diferente de \"all\" em channels", () => {
    expect(() => parseKeywordsConfig({ channels: "todos", keywords: [{ terms: "m" }] })).toThrow(ConfigError);
  });

  it("rejeita lista de canais vazia", () => {
    expect(() => parseKeywordsConfig({ channels: [], keywords: [{ terms: "x" }] })).toThrow(ConfigError);
  });

  it("rejeita palavra-chave sem termos", () => {
    expect(() => parseKeywordsConfig({ channels: ["pelando"], keywords: [{ terms: "  " }] })).toThrow(
      /terms/,
    );
  });

  it("rejeita canal que é só @", () => {
    expect(() => parseKeywordsConfig({ channels: ["@"], keywords: [{ terms: "x" }] })).toThrow(ConfigError);
  });
});

describe("loadKeywordsConfig", () => {
  async function tempFile(content: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "keywords-"));
    const path = join(dir, "keywords.json");
    await writeFile(path, content);
    return path;
  }

  it("lê um arquivo válido", async () => {
    const path = await tempFile('{ "channels": ["pelando"], "keywords": [{ "terms": "monitor" }] }');
    await expect(loadKeywordsConfig(path)).resolves.toEqual({
      channels: { mode: "list", names: ["pelando"] },
      keywords: [{ terms: "monitor" }],
    });
  });

  it("explica quando o arquivo não existe", async () => {
    await expect(loadKeywordsConfig("/nao/existe.json")).rejects.toThrow(/não encontrado/);
  });

  it("explica quando o JSON está quebrado", async () => {
    const path = await tempFile('{ "channels": ["pelando"], }');
    await expect(loadKeywordsConfig(path)).rejects.toThrow(/não é um JSON válido/);
  });
});
