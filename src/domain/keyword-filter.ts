export interface Keyword {
  readonly terms: string;
  readonly exclude?: readonly string[];
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

function containsAll(textWords: ReadonlySet<string>, phrase: string): boolean {
  const phraseWords = tokenize(phrase);
  return phraseWords.length > 0 && phraseWords.every((word) => textWords.has(word));
}

function matchesWords(textWords: ReadonlySet<string>, keyword: Keyword): boolean {
  if (!containsAll(textWords, keyword.terms)) return false;
  const excludes = keyword.exclude ?? [];
  return !excludes.some((excluded) => containsAll(textWords, excluded));
}

export function matchesKeyword(text: string, keyword: Keyword): boolean {
  return matchesWords(new Set(tokenize(text)), keyword);
}

export function findMatchingKeyword(
  text: string,
  keywords: readonly Keyword[],
): Keyword | undefined {
  const textWords = new Set(tokenize(text));
  return keywords.find((keyword) => matchesWords(textWords, keyword));
}
