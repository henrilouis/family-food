import type { Amount, IngredientGroup, Step } from "../bundle/bundle.ts";

/** Words that end an ingredient span even when the ingredient list happens to contain them. */
const JOINING_WORDS = new Set(
  "a an and as at by for from in into of off on onto or over plus the then through to until with without".split(" "),
);

const WORD = /^\s+([A-Za-zÀ-ÖØ-öø-ÿ]+(?:-[A-Za-zÀ-ÖØ-öø-ÿ]+)*)/;

/** Lower case, without a plural ending, so "tomato" and "tomatoes" compare equal. */
const stem = (word: string) => word.toLowerCase().replace(/(es|s)$/, "");

/** The words of a Recipe's ingredient list, as stems. */
export function ingredientWords(groups: IngredientGroup[]): Set<string> {
  const words = groups.flatMap((g) => g.items).flatMap((item) => item.text.split(/[^A-Za-zÀ-ÖØ-öø-ÿ]+/));
  return new Set(words.filter((w) => w.length > 1).map(stem));
}

/**
 * Splits a Method step into plain text and ingredient spans. Each italic amount starts a span, which
 * takes in the following words for as long as they appear in the ingredient list and aren't joining words.
 * `parse` reads an italic amount; it throws when the amount doesn't parse.
 */
export function markStep(text: string, vocabulary: Set<string>, parse: (amount: string) => Amount): Step {
  const step: Step = [];
  const pushText = (s: string) => {
    if (!s) return;
    if (typeof step.at(-1) === "string") step[step.length - 1] += s;
    else step.push(s);
  };
  let rest = text;
  for (let m: RegExpMatchArray | null; (m = rest.match(/\*([^*]+)\*/)); ) {
    pushText(rest.slice(0, m.index));
    rest = rest.slice(m.index! + m[0].length);
    const words: string[] = [];
    for (let w: RegExpMatchArray | null; (w = rest.match(WORD)); rest = rest.slice(w[0].length)) {
      const word = w[1];
      if (JOINING_WORDS.has(word.toLowerCase()) || !word.split("-").every((part) => vocabulary.has(stem(part)))) break;
      words.push(word);
    }
    step.push({ amount: parse(m[1]), ingredient: words.join(" ") });
  }
  pushText(rest);
  return step;
}
