import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

// A product as AH's REST search returns it; the fake AH's catalogue holds these.
type AhProduct = {
  webshopId: number;
  title: string;
  brand: string;
  salesUnitSize: string;
  priceBeforeBonus: number;
  currentPrice?: number;
  isBonus?: boolean;
  bonusMechanism?: string;
  isOrderable?: boolean;
  isSponsored?: boolean;
};

const product = (p: AhProduct) => ({ isBonus: false, isOrderable: true, isSponsored: false, ...p });

async function fakeAh(catalogue: AhProduct[]) {
  const box = await sandbox();
  const state = await box.fake("ah");
  await writeFile(path.join(state, "products.json"), JSON.stringify(catalogue.map(product), null, 2));
  return { ...box, state };
}

describe("food ah search", () => {
  test("lists the matching products, cheapest per kilo first", async () => {
    const { run } = await fakeAh([
      { webshopId: 1, title: "Bonduelle Kikkererwten", brand: "Bonduelle", salesUnitSize: "310 g", priceBeforeBonus: 2.29 },
      { webshopId: 2, title: "AH Kikkererwten", brand: "AH", salesUnitSize: "400 g", priceBeforeBonus: 0.99 },
      { webshopId: 3, title: "AH Rode bonen", brand: "AH", salesUnitSize: "400 g", priceBeforeBonus: 0.89 },
      { webshopId: 4, title: "Tetra kikkererwten droog", brand: "Tetra", salesUnitSize: "1 kg", priceBeforeBonus: 2.19 },
    ]);

    const result = await run(["ah", "search", "kikkererwten"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      expect.objectContaining({ id: 4, title: "Tetra kikkererwten droog", size: "1 kg", price: 2.19, unitPrice: { amount: 2.19, per: "kg" } }),
      expect.objectContaining({ id: 2, title: "AH Kikkererwten", size: "400 g", price: 0.99, unitPrice: { amount: 2.48, per: "kg" } }),
      expect.objectContaining({ id: 1, title: "Bonduelle Kikkererwten", size: "310 g", price: 2.29, unitPrice: { amount: 7.39, per: "kg" } }),
    ]);
  });

  test("leaves out sponsored, non-orderable and multipack products", async () => {
    const { run } = await fakeAh([
      { webshopId: 1, title: "Bonduelle Kikkererwten", brand: "Bonduelle", salesUnitSize: "310 g", priceBeforeBonus: 0.5, isSponsored: true },
      { webshopId: 2, title: "AH Kikkererwten", brand: "AH", salesUnitSize: "400 g", priceBeforeBonus: 0.99 },
      { webshopId: 3, title: "AH Kikkererwten 3-pack", brand: "AH", salesUnitSize: "3 x 400 g", priceBeforeBonus: 2.49 },
      { webshopId: 4, title: "Kikkererwten multipack", brand: "Hak", salesUnitSize: "1,2 kg", priceBeforeBonus: 1.5 },
      { webshopId: 5, title: "Tetra kikkererwten droog", brand: "Tetra", salesUnitSize: "1 kg", priceBeforeBonus: 2.19, isOrderable: false },
    ]);

    const result = await run(["ah", "search", "kikkererwten"]);

    expect(JSON.parse(result.stdout).map((p: { id: number }) => p.id)).toEqual([2]);
  });

  test("ranks by the price you pay now, Bonus included, and says what the Bonus is", async () => {
    const { run } = await fakeAh([
      { webshopId: 1, title: "AH Basmati rijst", brand: "AH", salesUnitSize: "1 kg", priceBeforeBonus: 2.99 },
      { webshopId: 2, title: "Lassie Basmati rijst", brand: "Lassie", salesUnitSize: "1 kg", priceBeforeBonus: 3.99, currentPrice: 1.99, isBonus: true, bonusMechanism: "1 + 1 gratis" },
    ]);

    const result = await run(["ah", "search", "basmati rijst"]);

    expect(JSON.parse(result.stdout)).toEqual([
      expect.objectContaining({ id: 2, price: 1.99, unitPrice: { amount: 1.99, per: "kg" }, bonus: "1 + 1 gratis" }),
      expect.objectContaining({ id: 1, price: 2.99, unitPrice: { amount: 2.99, per: "kg" }, bonus: null }),
    ]);
  });

  test("lets the AH house brand win a tie on unit price", async () => {
    const { run } = await fakeAh([
      { webshopId: 1, title: "Zaanlander Halfvolle melk", brand: "Zaanlander", salesUnitSize: "1 l", priceBeforeBonus: 1.15 },
      { webshopId: 2, title: "AH Halfvolle melk", brand: "AH", salesUnitSize: "1 l", priceBeforeBonus: 1.15 },
      { webshopId: 3, title: "AH Biologisch Halfvolle melk", brand: "AH Biologisch", salesUnitSize: "1,5 l", priceBeforeBonus: 1.73 },
    ]);

    const result = await run(["ah", "search", "halfvolle melk"]);

    expect(JSON.parse(result.stdout).map((p: { id: number }) => p.id)).toEqual([2, 3, 1]);
  });

  test("keeps products it can't compare on unit price, after the ones it can", async () => {
    const { run } = await fakeAh([
      { webshopId: 1, title: "AH Courgette", brand: "AH", salesUnitSize: "per stuk", priceBeforeBonus: 0.89 },
      { webshopId: 2, title: "AH Courgette spaghetti", brand: "AH", salesUnitSize: "1 schaal", priceBeforeBonus: 2.49 },
      { webshopId: 3, title: "AH Courgette biologisch", brand: "AH Biologisch", salesUnitSize: "500 g", priceBeforeBonus: 2.29 },
      { webshopId: 4, title: "AH Courgette grof", brand: "AH", salesUnitSize: "ca. 600 g", priceBeforeBonus: 1.49 },
    ]);

    const result = await run(["ah", "search", "courgette"]);

    expect(JSON.parse(result.stdout)).toEqual([
      expect.objectContaining({ id: 4, unitPrice: { amount: 2.48, per: "kg" } }),
      expect.objectContaining({ id: 3, unitPrice: { amount: 4.58, per: "kg" } }),
      expect.objectContaining({ id: 1, unitPrice: { amount: 0.89, per: "piece" } }),
      expect.objectContaining({ id: 2, unitPrice: null }),
    ]);
  });

  test("with --need, leaves out packs that would waste more than twice what's needed", async () => {
    const { run } = await fakeAh([
      { webshopId: 1, title: "Al'Fez Tahin", brand: "Al'Fez", salesUnitSize: "250 g", priceBeforeBonus: 2.99 },
      { webshopId: 2, title: "AH Tahin", brand: "AH", salesUnitSize: "500 g", priceBeforeBonus: 4.49 },
      { webshopId: 3, title: "Sesamo tahin groot", brand: "Sesamo", salesUnitSize: "1 kg", priceBeforeBonus: 6.99 },
    ]);

    const result = await run(["ah", "search", "tahin", "--need", "200g"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).map((p: { id: number }) => p.id)).toEqual([2, 1]);
  });

  test("with --need, keeps the least wasteful packs when every pack would waste too much", async () => {
    const { run } = await fakeAh([
      { webshopId: 1, title: "AH Komijnzaad", brand: "AH", salesUnitSize: "100 g", priceBeforeBonus: 2.49 },
      { webshopId: 2, title: "Verstegen Komijnzaad", brand: "Verstegen", salesUnitSize: "30 g", priceBeforeBonus: 1.99 },
    ]);

    const result = await run(["ah", "search", "komijnzaad", "--need", "1,5 kg"]);
    const small = await run(["ah", "search", "komijnzaad", "--need", "5 g"]);

    expect(JSON.parse(result.stdout).map((p: { id: number }) => p.id)).toEqual([1, 2]);
    expect(JSON.parse(small.stdout).map((p: { id: number }) => p.id)).toEqual([2]);
  });

  test("explains --need when it can't read the amount", async () => {
    const { run } = await fakeAh([]);

    const result = await run(["ah", "search", "tahin", "--need", "a handful"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--need");
  });
});
