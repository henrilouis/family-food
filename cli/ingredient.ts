// How ingredient names compare, wherever an ingredient is looked up: a Pinned Product, a Staple, the words of a
// Method step. One rule: no case, spacing or remarks in brackets, and a word in the singular is the same word in
// a simple English plural ("aubergine" and "aubergines", "tomato" and "tomatoes", "berry" and "berries").

/** An ingredient line's ingredient without its preparation: "onion, finely chopped" → "onion". */
export function ingredientName(text: string): string {
  return text.split(",")[0].trim();
}

/** A word in lower case, and the singulars a simple English plural ending would give it: "olives" → olives, olive, oliv. */
function wordForms(word: string): string[] {
  const w = word.toLowerCase();
  const forms = [w];
  if (w.endsWith("ies")) forms.push(`${w.slice(0, -3)}y`);
  if (w.endsWith("es")) forms.push(w.slice(0, -2));
  if (w.endsWith("s")) forms.push(w.slice(0, -1));
  return forms;
}

/** A set of words that finds a word in the singular or the plural. */
export type WordSet = { has(word: string): boolean };

export function wordSet(words: Iterable<string>): WordSet {
  const forms = new Set([...words].flatMap(wordForms));
  return { has: (word) => wordForms(word).some((form) => forms.has(form)) };
}

/** Two ingredient names are the same: "Red onions" is "red onion", "pandan (kewra) water" is "pandan water". */
export function sameIngredient(a: string, b: string): boolean {
  const words = (s: string) => s.replace(/\s*\([^)]*\)?/g, " ").trim().split(/\s+/).filter(Boolean);
  const [x, y] = [words(a), words(b)];
  return x.length === y.length && x.every((word, i) => wordSet([word]).has(y[i]));
}
