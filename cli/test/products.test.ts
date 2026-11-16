import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

type Pin = { ingredient: string; product?: number | null; title?: string; pack?: string; kind?: string };

async function pinBox() {
  const box = await sandbox();
  const products = path.join(box.vault, "Products.md");
  /** Runs `food products pin` with these pins. */
  const pin = async (pins: Pin[]) => {
    const file = path.join(box.configDir, "..", "pins.json");
    await writeFile(file, JSON.stringify(pins));
    return box.run(["products", "pin", file]);
  };
  return { ...box, products, pin, read: () => readFile(products, "utf8") };
}

describe("food products pin", () => {
  test("appends confirmed matches to Products.md, keeping the table's layout", async () => {
    const box = await pinBox();

    const result = await box.pin([
      { ingredient: "tomatoes", product: 4028, title: "AH Trostomaten 500 g", pack: "500 g ≈ 6 tomatoes", kind: "Fresh" },
      { ingredient: "salt", product: null, kind: "Always in House" },
    ]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("Pinned tomatoes: AH Trostomaten 500 g (4028), Fresh\nPinned salt: no AH product, Always in House\n");
    expect(await box.read()).toBe(`# Products

Pinned Products: the AH product remembered for a recipe ingredient, bought without asking again. Grows from confirmed matches; a correction replaces the entry.

| Ingredient         | AH product                       | Pack               | Kind                |
|--------------------|----------------------------------|--------------------|---------------------|
| red split lentils  | AH Rode splitlinzen 400 g (4011) | 400 g              | Cupboard Ingredient |
| onion              | AH Uien 1 kg (4012)              | 1 kg ≈ 8 onions    | Fresh               |
| fresh leaf spinach | AH Spinazie 400 g (4013)         | 400 g              | Fresh               |
| coconut milk       | AH Kokosmelk 400 ml (4014)       | 400 ml             | Cupboard Ingredient |
| sunflower oil      | AH Zonnebloemolie 1 l (4015)     | 1 l                | Always in House     |
| tomatoes           | AH Trostomaten 500 g (4028)      | 500 g ≈ 6 tomatoes | Fresh               |
| salt               |                                  |                    | Always in House     |
`);
  });

  test("a correction replaces the entry for that ingredient", async () => {
    const box = await pinBox();

    const result = await box.pin([{ ingredient: "Onions", product: 4099, title: "AH Rode uien 500 g", pack: "500 g ≈ 5 onions", kind: "Fresh" }]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("Replaced onion: AH Uien 1 kg (4012), Fresh → Onions: AH Rode uien 500 g (4099), Fresh\n");
    const rows = (await box.read()).split("\n").filter((l) => l.startsWith("| "));
    expect(rows).toHaveLength(6);
    expect(rows[2]).toMatch(/^\| Onions +\| AH Rode uien 500 g \(4099\) +\| 500 g ≈ 5 onions +\| Fresh +\|$/);
  });

  test("writes the webshop id in the AH id column when the table has one", async () => {
    const box = await pinBox();
    await writeFile(box.products, "# Products\n\nIntro.\n\n| Ingredient | AH product | AH id | Pack | Kind |\n|---|---|---|---|---|\n");

    expect((await box.pin([{ ingredient: "onion", product: 4012, title: "AH Uien 1 kg", pack: "1 kg ≈ 8 onions", kind: "Fresh" }])).code).toBe(0);
    expect((await box.pin([{ ingredient: "salt", kind: "Always in House" }])).code).toBe(0);

    expect(await box.read()).toBe(
      "# Products\n\nIntro.\n\n| Ingredient | AH product | AH id | Pack | Kind |\n|---|---|---|---|---|\n" +
        "| onion | AH Uien 1 kg | 4012 | 1 kg ≈ 8 onions | Fresh |\n" +
        "| salt |  |  |  | Always in House |\n",
    );
  });

  test("starts Products.md when there is none", async () => {
    const box = await pinBox();
    await rm(box.products);

    expect((await box.pin([{ ingredient: "onion", product: 4012, title: "AH Uien 1 kg", pack: "1 kg", kind: "Fresh" }])).code).toBe(0);

    expect(await box.read()).toContain("| Ingredient | AH product | AH id | Pack | Kind |\n|---|---|---|---|---|\n| onion | AH Uien 1 kg | 4012 | 1 kg | Fresh |\n");
  });

  test("refuses pins it can't write, and writes none of them", async () => {
    const box = await pinBox();
    const before = await box.read();

    const result = await box.pin([
      { ingredient: "garlic", product: 4024, title: "AH Knoflook", pack: "3 st", kind: "Fresh" },
      { ingredient: "basmati rice", product: 4051, title: "AH Basmati rijst 1 kg", pack: "1 kg", kind: "Pantry" },
      { ingredient: "ginger", product: 4023, pack: "100 g", kind: "Fresh" },
      { ingredient: "", kind: "Always in House" },
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "Nothing pinned:\n" +
        '- basmati rice: kind "Pantry"; expected one of Fresh, Cupboard Ingredient, Always in House\n' +
        "- ginger: a product needs its title\n" +
        "- a pin needs an ingredient\n",
    );
    expect(await box.read()).toBe(before);
  });
});
