import { describe, expect, it } from "vitest";
import { findMatchingKeyword, matchesKeyword, type Keyword } from "../src/domain/keyword-filter.js";

const odyssey: Keyword = { terms: "odyssey g5 27", exclude: ["32", "oled"] };

describe("matchesKeyword", () => {
  it("bate quando todos os termos aparecem, em qualquer ordem", () => {
    expect(matchesKeyword("Monitor Samsung Odyssey G5 27 QHD", odyssey)).toBe(true);
    expect(matchesKeyword("27 polegadas, G5 da linha Odyssey", odyssey)).toBe(true);
  });

  it("não bate quando falta algum termo", () => {
    expect(matchesKeyword("Monitor Samsung Odyssey G5", odyssey)).toBe(false);
  });

  it("ignora maiúsculas e acentos, dos dois lados", () => {
    const keyword: Keyword = { terms: "monitor cães" };
    expect(matchesKeyword("MONITOR para CAES", keyword)).toBe(true);
    expect(matchesKeyword("Mônitor para cães", { terms: "monitor caes" })).toBe(true);
  });

  it("aceita pontuação colada nos termos", () => {
    expect(matchesKeyword('Odyssey G5 27" (QHD), 165Hz!', odyssey)).toBe(true);
  });

  it("compara palavras inteiras, não pedaços", () => {
    // "27" não deve bater com "270" nem "2700"
    expect(matchesKeyword("Odyssey G5 270Hz", odyssey)).toBe(false);
  });

  it("descarta quando aparece um termo de exclusão", () => {
    expect(matchesKeyword("Odyssey G5 27 e 32 polegadas", odyssey)).toBe(false);
    expect(matchesKeyword("Odyssey G5 27 OLED", odyssey)).toBe(false);
  });

  it("não confunde exclusão com pedaço de preço", () => {
    // o "32" de "R$ 1.329,00" não é a palavra "32"
    expect(matchesKeyword("Odyssey G5 27 por R$ 1.329,00", odyssey)).toBe(true);
  });

  it("exclusão com várias palavras só descarta se todas aparecerem", () => {
    const keyword: Keyword = { terms: "monitor 27", exclude: ["usado vitrine"] };
    expect(matchesKeyword("Monitor 27 usado", keyword)).toBe(true);
    expect(matchesKeyword("Monitor 27 usado, de vitrine", keyword)).toBe(false);
  });

  it("palavra-chave vazia nunca bate", () => {
    expect(matchesKeyword("qualquer coisa", { terms: "   " })).toBe(false);
  });

  it("exclusão vazia é ignorada", () => {
    expect(matchesKeyword("Odyssey G5 27", { terms: "odyssey", exclude: [""] })).toBe(true);
  });
});

describe("findMatchingKeyword", () => {
  const keywords: Keyword[] = [odyssey, { terms: "monitor qhd 27" }];

  it("devolve a palavra-chave que bateu", () => {
    expect(findMatchingKeyword("Monitor LG 27 QHD", keywords)).toBe(keywords[1]);
  });

  it("devolve a primeira quando mais de uma bate", () => {
    expect(findMatchingKeyword("Monitor Odyssey G5 27 QHD", keywords)).toBe(odyssey);
  });

  it("devolve undefined quando nenhuma bate", () => {
    expect(findMatchingKeyword("Air fryer em promoção", keywords)).toBeUndefined();
  });

  it("devolve undefined para lista vazia", () => {
    expect(findMatchingKeyword("Odyssey G5 27", [])).toBeUndefined();
  });
});
