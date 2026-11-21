import type { Rating, RecipePage } from "../../recipe-page.ts";
import type { AhRecipe, AhRecipeProductSuggestion, AhRecipeRating, AhRecipeSummary } from "./client.ts";

/** Allerhande's web address for recipes; `source` of a Recipe imported from Allerhande starts with it. */
const RECIPE_PAGES = "https://www.ah.nl/allerhande/recept/";

/** The recipe number in an Allerhande recipe's address (`https://www.ah.nl/allerhande/recept/R-R1302900/…`), else null. */
export function allerhandeRecipeId(url: string): number | null {
  const address = URL.parse(url);
  if (!address || !/^(?:.+\.)?ah\.nl$/i.test(address.hostname)) return null;
  const id = address.pathname.match(/^\/allerhande\/recept\/R-R(\d+)(?:\/|$)/i);
  return id ? Number(id[1]) : null;
}

/** The filters every Allerhande search uses: Novel Recipes are vegetarian dinners. */
export const VEGETARIAN_MAINS: Record<string, string[]> = { "speciale-wensen": ["vegetarisch"], menugang: ["hoofdgerecht"] };

/** An Allerhande recipe found by search: enough to judge it as a Novel Recipe candidate before reading it whole. */
export type AllerhandeCandidate = {
  url: string;
  title: string;
  servings: number | null;
  /** Allerhande's hands-on time (bereidingstijd). */
  activeMinutes: number | null;
  /** Hands-on, oven and waiting time together. */
  totalMinutes: number | null;
  /** Allerhande's tag values (Dutch): diet, course, season, cuisine, "snel", … Hints only. */
  tags: string[];
  /** As in `food recipe fetch`: stars out of 5 with one decimal, and how many rated it; null when unrated. */
  rating: Rating | null;
};

export function candidate(summary: AhRecipeSummary): AllerhandeCandidate {
  const { cook, oven, wait } = summary.time ?? {};
  return {
    url: `${RECIPE_PAGES}R-R${summary.id}${summary.slug ? `/${summary.slug}` : ""}`,
    title: summary.title.trim(),
    servings: summary.serving?.number ?? null,
    activeMinutes: cook ?? null,
    totalMinutes: minutesTogether(cook, oven, wait),
    tags: (summary.tags ?? []).map((tag) => tag.value),
    rating: rating(summary.rating),
  };
}

/** Advertorials and baby food ("… - 12+ maanden") are never a family dinner. */
export const isFamilyDinner = (summary: AhRecipeSummary) =>
  !/\(advertorial\)/i.test(summary.title) && !/\b\d+\s*\+?\s*maanden\b/i.test(summary.title);

export function minutesTogether(...parts: (number | null | undefined)[]): number | null {
  const known = parts.filter((p): p is number => typeof p === "number");
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

/** Same rules as a page's schema.org rating: no stars, or nobody rated it, is unrated. */
export function rating(value: AhRecipeRating | null | undefined): Rating | null {
  const average = value?.average;
  const count = value?.count ?? null;
  if (typeof average !== "number" || !Number.isFinite(average) || count === 0) return null;
  return { value: Math.round(Math.min(5, Math.max(0, average)) * 10) / 10, count };
}

/**
 * An Allerhande recipe in the shape `food recipe fetch` gives any recipe page. Allerhande's times map as:
 * `prepMinutes` its hands-on time (bereidingstijd), `cookMinutes` its oven time, `totalMinutes` both plus waiting.
 */
export function recipePage(r: AhRecipe): RecipePage {
  const tagged = (key: string) => (r.tags ?? []).filter((tag) => tag.key === key).map((tag) => tag.value);
  const servings = r.servings?.number ?? null;
  return {
    url: r.href ? new URL(r.href, "https://www.ah.nl").href : `${RECIPE_PAGES}R-R${r.id}`,
    title: r.title.trim(),
    servings,
    yield: servings === null ? [] : [String(servings)],
    prepMinutes: r.cookTime ?? null,
    cookMinutes: r.ovenTime ?? null,
    totalMinutes: minutesTogether(r.cookTime, r.ovenTime, r.waitTime),
    cuisine: tagged("keuken").join(", ") || null,
    category: tagged("menugang").join(", ") || null,
    diets: tagged("speciale-wensen"),
    language: "nl",
    rating: rating(r.rating),
    ingredients: (r.ingredients ?? []).map(ingredientLine).filter(Boolean),
    steps: (r.preparation?.steps ?? []).map((step) => step.trim()).filter(Boolean).map((text) => ({ section: null, text })),
  };
}

/**
 * AH splits each ingredient into quantity, unit and name. Its `text` is used as the line when it names the
 * ingredient; otherwise the line is built from the parts, with `text` as a remark ("200 g feta, in blokjes").
 */
function ingredientLine(i: NonNullable<AhRecipe["ingredients"]>[number]): string {
  const text = i.text?.trim() ?? "";
  const many = typeof i.quantity === "number" && i.quantity > 1;
  const name = ((many ? i.name?.plural : i.name?.singular) ?? i.name?.singular ?? "").trim();
  const names = [i.name?.singular, i.name?.plural].filter((n): n is string => !!n?.trim());
  if (text && names.some((n) => text.toLowerCase().includes(n.trim().toLowerCase()))) return text;
  const unit = (many ? i.quantityUnit?.plural : i.quantityUnit?.singular)?.trim();
  const quantity = typeof i.quantity === "number" ? String(i.quantity).replace(".", ",") : "";
  const line = [quantity, unit, name].filter(Boolean).join(" ");
  return [line, text].filter(Boolean).join(", ");
}

/** AH's product for one ingredient of an Allerhande recipe, as it would put it in the basket for the recipe's servings. */
export type ProductSuggestion = {
  /** The ingredient line as Allerhande writes it. */
  ingredient: string;
  optional: boolean;
  /** `price`: one pack now, Bonus included; null when AH doesn't say. Null product: AH suggests none. */
  product: { id: number; title: string; size: string | null; price: number | null } | null;
  /** Packs AH would buy for the recipe as written. */
  packs: number | null;
};

export function productSuggestion(s: AhRecipeProductSuggestion): ProductSuggestion {
  const product = s.productSuggestion?.product;
  return {
    ingredient: (s.ingredient?.completeText ?? s.ingredient?.name ?? "").trim(),
    optional: s.optional ?? false,
    product: product
      ? { id: product.id, title: product.title, size: product.salesUnitSize ?? null, price: product.priceV2?.now?.amount ?? null }
      : null,
    packs: product ? (s.productSuggestion?.quantity ?? null) : null,
  };
}
