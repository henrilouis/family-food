import type { AhProduct } from "./client.ts";

/** A product as the gateway hands it out: cleaned up, with the price you pay now and the unit price at that price. */
export type Product = {
  id: number;
  title: string;
  brand: string | null;
  size: string | null;
  /** Euros, at the current price (Bonus included). */
  price: number;
  /** Euros per kg, l or piece, at the current price; null when the pack size can't be read. */
  unitPrice: { amount: number; per: "kg" | "l" | "piece" } | null;
  /** The Bonus offer, e.g. "1 + 1 gratis", when the product is on Bonus. */
  bonus: string | null;
  /** Bought by the household before; only known when logged in. */
  previouslyBought: boolean;
};

type Dimension = "mass" | "volume" | "count";
/** An amount in g, ml or pieces. */
export type Amount = { value: number; dimension: Dimension };

const units: Record<string, [Dimension, number]> = {
  g: ["mass", 1],
  gr: ["mass", 1],
  gram: ["mass", 1],
  kg: ["mass", 1000],
  kilo: ["mass", 1000],
  ml: ["volume", 1],
  cl: ["volume", 10],
  dl: ["volume", 100],
  l: ["volume", 1000],
  liter: ["volume", 1000],
  st: ["count", 1],
  stuk: ["count", 1],
  stuks: ["count", 1],
  piece: ["count", 1],
  pieces: ["count", 1],
  "": ["count", 1],
};

/** Reads an amount or an AH pack size, such as "400 g", "ca. 1 kg", "1,5 l", "6 stuks", "per stuk" or "3" (pieces). */
export function parseAmount(text: string | undefined): Amount | null {
  if (!text) return null;
  const size = text.trim().toLowerCase().replace(/^ca\.?\s*/, "").replace(/^per\s+/, "1 ");
  const match = size.match(/^(\d+(?:[.,]\d+)?)\s*([a-z]*)$/);
  if (!match) return null;
  const unit = units[match[2]];
  if (!unit) return null;
  return { value: Number(match[1].replace(",", ".")) * unit[1], dimension: unit[0] };
}

const perUnit = { mass: ["kg", 1000], volume: ["l", 1000], count: ["piece", 1] } as const;

const cents = (euros: number) => Math.round(euros * 100);
const currentCents = (p: AhProduct) => cents(p.currentPrice || p.priceBeforeBonus || 0);

type Candidate = { product: AhProduct; pack: Amount | null; unitCents: number | null };

function candidate(product: AhProduct): Candidate {
  const pack = parseAmount(product.salesUnitSize);
  const unitCents = pack ? Math.round((currentCents(product) * perUnit[pack.dimension][1]) / pack.value) : null;
  return { product, pack, unitCents };
}

function toProduct({ product, pack, unitCents }: Candidate): Product {
  return {
    id: product.webshopId,
    title: product.title,
    brand: product.brand ?? null,
    size: product.salesUnitSize ?? null,
    price: currentCents(product) / 100,
    unitPrice: pack && unitCents !== null ? { amount: unitCents / 100, per: perUnit[pack.dimension][0] } : null,
    bonus: product.isBonus ? (product.bonusMechanism ?? null) : null,
    previouslyBought: product.isPreviouslyBought ?? false,
  };
}

/** The unit most results are sold in; only those are compared on unit price. */
function mostCommonDimension(candidates: Candidate[]): Dimension | undefined {
  const counts = new Map<Dimension, number>();
  for (const { pack } of candidates) if (pack) counts.set(pack.dimension, (counts.get(pack.dimension) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function leastWasteful(candidates: Candidate[], need: Amount): Candidate[] {
  const waste = ({ pack }: Candidate) => Math.ceil(need.value / pack!.value - 1e-9) * pack!.value - need.value;
  const fine = candidates.filter((c) => waste(c) <= 2 * need.value);
  if (fine.length > 0) return fine;
  const least = Math.min(...candidates.map(waste));
  return candidates.filter((c) => waste(c) === least);
}

const isMultipack = (p: AhProduct) => /\d\s*[x×]\s*\d/i.test(p.salesUnitSize ?? "") || /multipack/i.test(p.title);
const isHouseBrand = (p: AhProduct) => /^AH\b/.test(p.brand ?? "");

/**
 * Cleans up AH search results and ranks them: drops sponsored, non-orderable and multipack products,
 * then puts the lowest unit price at the current price first, the AH house brand first on a tie.
 * With a `need`, packs that would waste more than twice what's needed are dropped (unless every pack would;
 * then the least wasteful stay), and only packs in the need's unit are compared.
 * Products sold in another unit than most results, or whose pack size can't be read, follow in AH's order.
 */
export function rankProducts(results: AhProduct[], need?: Amount): Product[] {
  const candidates = results
    .filter((p) => !p.isSponsored && p.isOrderable && !isMultipack(p))
    .map(candidate);
  const reference = need?.dimension ?? mostCommonDimension(candidates);
  let comparable = candidates.filter((c) => c.pack?.dimension === reference);
  if (need) comparable = leastWasteful(comparable, need);
  const others = candidates.filter((c) => c.pack?.dimension !== reference);
  comparable.sort(
    (a, b) => a.unitCents! - b.unitCents! || Number(isHouseBrand(b.product)) - Number(isHouseBrand(a.product)),
  );
  return [...comparable, ...others].map(toProduct);
}

/** Keeps the previously bought products that can be ordered, in AH's order. */
export function previouslyBought(results: AhProduct[]): Product[] {
  return results
    .filter((p) => p.isPreviouslyBought && p.isOrderable && !p.isSponsored)
    .map((p) => toProduct(candidate(p)));
}
