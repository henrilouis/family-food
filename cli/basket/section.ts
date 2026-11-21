import { readFile, writeFile } from "node:fs/promises";
import { sectionLines, type Note } from "../vault.ts";
import type { BasketOutcome } from "./fill.ts";
import { shoppingList } from "./report.ts";

const BASKET_HEADING = "Basket";

/** The products (with AH's title) and free-text notes an earlier run added for the week, from its `## Basket` section. */
export type BasketRecord = {
  products: { id: number; title: string; quantity: number }[];
  notes: string[];
  /** The section's product and note lines as written. */
  lines: string[];
};

/** Reads the `## Basket` section's product lines ("- <title> (id <id>) ×<packs>: …") and notes ("- Note: …"). */
export function basketRecord(weekMenu: Note): BasketRecord {
  const record: BasketRecord = { products: [], notes: [], lines: [] };
  for (const line of sectionLines(weekMenu, BASKET_HEADING)) {
    const product = line.match(/^- (.+) \(id (\d+)\) ×(\d+): (.*)$/);
    const note = line.match(/^- Note: (.*)$/);
    if (product) record.products.push({ id: Number(product[2]), title: product[1], quantity: Number(product[3]) });
    else if (note) record.notes.push(note[1]);
    if (product || note) record.lines.push(line);
  }
  return record;
}

/**
 * Records what Mijn lijst got for the week in the Week Menu's `## Basket` section, replacing an earlier one:
 * "- <AH title> (id <webshop id>) ×<packs>: <ingredients covered>", "- Note: <free-text note>", "Have at home: …".
 * When AH is down, keeps what an earlier run added and adds the shopping list (without ids) of what is still needed.
 * Otherwise, when nothing was written to AH, the note is left as it is.
 */
export async function writeBasketSection(outcome: BasketOutcome): Promise<void> {
  const { plan } = outcome;
  if (outcome.kind === "AH down") {
    await replaceSection(plan.file, [
      `## ${BASKET_HEADING}`,
      ...plan.recorded.lines,
      "Not in Mijn lijst, AH ordering was down:",
      ...shoppingList(plan, outcome.change),
      `Have at home: ${plan.haveAtHome.join(", ") || "none"}`,
    ]);
    return;
  }
  if (outcome.kind !== "filled") return;
  await replaceSection(plan.file, [
    `## ${BASKET_HEADING}`,
    ...outcome.products.map((p) => `- ${p.title} (id ${p.id}) ×${p.quantity}: ${p.covers.join(", ")}`),
    ...plan.notes.map((note) => `- Note: ${note}`),
    `Have at home: ${plan.haveAtHome.join(", ") || "none"}`,
  ]);
}

/** Puts `lines` (starting with the `## Basket` heading) in place of the note's `## Basket` section, or at its end. */
async function replaceSection(file: string, lines: string[]): Promise<void> {
  const text = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
  const all = text.split("\n");
  const start = all.findIndex((l) => l.trim().toLowerCase() === `## ${BASKET_HEADING.toLowerCase()}`);
  if (start < 0) {
    await writeFile(file, `${text.trimEnd()}\n\n${lines.join("\n")}\n`);
    return;
  }
  const end = all.findIndex((l, i) => i > start && /^##\s/.test(l));
  const rest = end < 0 ? [] : ["", ...all.slice(end)];
  await writeFile(file, `${[...all.slice(0, start), ...lines, ...rest].join("\n").trimEnd()}\n`);
}
