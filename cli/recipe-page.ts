import { UserError } from "./user-error.ts";

/** A recipe read from a web page's schema.org Recipe JSON-LD, cleaned up for the add-recipe skill. */
export type RecipePage = {
  url: string;
  title: string;
  /** The first whole number in the recipe's yield; null when it gives none. */
  servings: number | null;
  /** The yield as the site wrote it, e.g. ["4", "4 to 6 servings"]. */
  yield: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  /** The site's own labels: hints only, often empty or wrong. */
  cuisine: string | null;
  category: string | null;
  /** schema.org diets such as "VegetarianDiet". Rarely set; never proof that a recipe has no meat. */
  diets: string[];
  language: string | null;
  /** The site's schema.org aggregateRating, out of 5 (one decimal); null when the page has none. */
  rating: Rating | null;
  ingredients: string[];
  /** Empty when the JSON-LD has no steps (the skill then reads them from the page). */
  steps: { section: string | null; text: string }[];
};

/** `count` is the number of ratings (else reviews) behind the value; null when the site doesn't say. */
export type Rating = { value: number; count: number | null };

/** An honest User-Agent: sites that block bots by name can, and pretending to be a browser trips their bot checks. */
export const USER_AGENT = "family-food/0.1 (personal household recipe import; +https://github.com/henrilouis/family-food)";

/** A recipe page that couldn't be read; the skill falls back to reading the page itself. */
export class RecipePageError extends UserError {}

/** A site the household's agents never fetch from, by any means. */
export class RecipePageRefused extends UserError {}

/** Sites whose robots.txt blocks AI agents such as Claude-User (decision #5), by domain. */
const EXCLUDED_SITES: Record<string, string> = {
  "nytimes.com": "NYT Cooking",
  "seriouseats.com": "Serious Eats",
  "theguardian.com": "The Guardian",
};

function refuseExcluded(url: URL): void {
  const host = url.hostname.toLowerCase();
  const on = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  for (const [domain, site] of Object.entries(EXCLUDED_SITES)) {
    if (on(domain)) {
      throw new RecipePageRefused(
        `${site} asks AI agents not to fetch its pages (robots.txt), so food won't read ${url.href}. Paste the recipe text instead.`,
      );
    }
  }
  if (on("ah.nl")) {
    throw new RecipePageRefused(
      `ah.nl blocks automated reads, so food reads only Allerhande recipes (https://www.ah.nl/allerhande/recept/R-R<number>/…), through AH's app API, not ${url.href}. Paste the recipe text instead.`,
    );
  }
}

export async function fetchRecipePage(url: string): Promise<RecipePage> {
  let current = new URL(url);
  for (let hop = 0; ; hop++) {
    refuseExcluded(current);
    refuseOffMacUnderTest(current);
    let response: Response;
    try {
      response = await fetch(current, {
        headers: { "user-agent": USER_AGENT, accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new RecipePageError(`Couldn't fetch ${current.href}: ${(error as Error).cause ?? (error as Error).message}`);
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) throw new RecipePageError(`${url} redirects more than ${MAX_REDIRECTS} times`);
      // Each hop is checked before it is fetched, so a redirect can't lead onto an excluded site.
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new RecipePageError(`${current.href} answered HTTP ${response.status}`);
    const recipe = readRecipeJsonLd(await response.text());
    if (!recipe) throw new RecipePageError(`${current.href} has no schema.org Recipe`);
    return { url: current.href, ...recipe };
  }
}

const MAX_REDIRECTS = 5;

/** Tests serve recipe pages from this Mac; one that forgets to must not reach a real site. */
function refuseOffMacUnderTest(url: URL): void {
  if (process.env.VITEST && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new RecipePageError(`Under test, food recipe fetch will only fetch from this Mac, not ${url.href}`);
  }
}

type Json = unknown;
type JsonObject = Record<string, Json>;

/** The first schema.org Recipe in the page's JSON-LD blocks, including ones inside `@graph`. */
export function readRecipeJsonLd(html: string): Omit<RecipePage, "url"> | null {
  for (const [, script] of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: Json;
    try {
      data = JSON.parse(script.trim());
    } catch {
      continue;
    }
    const recipe = [...objects(data)].find((o) => types(o).includes("Recipe"));
    if (recipe) return toRecipePage(recipe);
  }
  return null;
}

function* objects(value: Json): Generator<JsonObject> {
  if (Array.isArray(value)) for (const item of value) yield* objects(item);
  else if (isObject(value)) {
    yield value;
    if ("@graph" in value) yield* objects(value["@graph"]);
  }
}

const isObject = (value: Json): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

/** "@type" values without their vocabulary prefix: "https://schema.org/Recipe" → "Recipe". */
const types = (o: JsonObject) => list(o["@type"]).map((t) => String(t).split(/[/:]/).pop()!);

const list = (value: Json): Json[] => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);

function toRecipePage(o: JsonObject): Omit<RecipePage, "url"> {
  const yields = [...new Set(list(o.recipeYield).map((y) => text(y)).filter(Boolean))];
  const servings = yields.map((y) => y.match(/\d+/)).find(Boolean);
  return {
    title: text(o.name),
    servings: servings ? Number(servings[0]) : null,
    yield: yields,
    prepMinutes: minutes(o.prepTime),
    cookMinutes: minutes(o.cookTime),
    totalMinutes: minutes(o.totalTime),
    cuisine: labels(o.recipeCuisine),
    category: labels(o.recipeCategory),
    diets: list(o.suitableForDiet).map((d) => String(d).split(/[/:]/).pop()!),
    language: typeof o.inLanguage === "string" ? o.inLanguage : null,
    rating: rating(o.aggregateRating),
    ingredients: list(o.recipeIngredient).map((line) => withoutPrices(text(line))).filter(Boolean),
    steps: steps(o.recipeInstructions, null),
  };
}

/** Scaled by `bestRating` (schema.org's default is 5): 8.4 of 10 is 4.2. Numbers may be strings with a decimal comma. */
function rating(value: Json): Rating | null {
  const o = list(value).find(isObject);
  if (!o) return null;
  const num = (v: Json) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim().replace(",", ".")) : NaN;
    return Number.isFinite(n) && (typeof v !== "string" || v.trim() !== "") ? n : null;
  };
  const stars = num(o.ratingValue);
  const best = num(o.bestRating) ?? 5;
  const count = num(o.ratingCount) ?? num(o.reviewCount);
  if (stars === null || best <= 0 || count === 0) return null;
  return { value: Math.round(Math.min(5, Math.max(0, (stars / best) * 5)) * 10) / 10, count };
}

function labels(value: Json): string | null {
  const joined = list(value).map(text).filter(Boolean).join(", ");
  return joined || null;
}

/** Budget Bytes writes each ingredient's price after it: "1 cup rice ($0.50)". */
const withoutPrices = (line: string) => line.replace(/\s*\(\$\d+(?:[.,]\d+)?\*?\)/g, "").trim();

function steps(value: Json, section: string | null): RecipePage["steps"] {
  return list(value).flatMap((item): RecipePage["steps"] => {
    if (typeof item === "string") return lines(item).map((t) => ({ section, text: t }));
    if (!isObject(item)) return [];
    if (types(item).includes("HowToSection") || (!item.text && item.itemListElement)) {
      return steps(item.itemListElement, text(item.name) || section);
    }
    const t = text(item.text ?? item.name);
    return t ? [{ section, text: t }] : [];
  });
}

/** One instruction string can hold several steps, one per line or paragraph. */
const lines = (html: string) =>
  html
    .split(/\n|<\/?(?:p|li|br)\b[^>]*>/i)
    .map(text)
    .filter(Boolean);

/** ISO 8601 durations as whole minutes: "PT45M", "PT0H37M", "PT3900S", "P0DT1H". */
function minutes(value: Json): number | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m || value.trim().toUpperCase() === "P" || value.trim().toUpperCase() === "PT") return null;
  const [, d = "0", h = "0", min = "0", s = "0"] = m;
  return Math.round(Number(d) * 1440 + Number(h) * 60 + Number(min) + Number(s) / 60);
}

/** Plain text: tags dropped, HTML entities decoded, whitespace collapsed. */
function text(value: Json): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return decodeEntities(String(value).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", deg: "°", times: "×", hellip: "…",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", frac12: "½", frac14: "¼", frac34: "¾",
  frac13: "⅓", frac23: "⅔", frac18: "⅛", eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", aacute: "á", agrave: "à",
  auml: "ä", iuml: "ï", ouml: "ö", uuml: "ü", ccedil: "ç", ntilde: "ñ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (entity, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}
