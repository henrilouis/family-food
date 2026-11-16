import path from "node:path";
import { sameIngredient } from "../ingredient.ts";
import { NoteError, readNote, sectionLines, tableRows, type Note } from "../vault.ts";

const STAPLES_NOTE = "Staples.md";

/** A Staple from Staples.md; `product` is its AH webshop id, null when it has none (it is bought as a free-text note). */
export type Staple = { name: string; product: number | null; title: string; quantity: number; kind: "Weekly" | "Ask" };

/**
 * The Staples this week's Basket gets: the Weekly Staples, changed by the Week Menu's `## Staples this week`:
 * "- Skip: milk ×1" (one fewer; without ×n none at all), "- Extra: eggs ×1" (more; ×1 without ×n),
 * "- Ask Staples: peanut butter, oats ×2" (chosen Ask Staples; their usual quantity without ×n).
 */
export async function staplesThisWeek(vault: string, weekMenu: Note): Promise<Staple[]> {
  const staples = await readStaples(vault);
  const chosen = new Map(staples.filter((s) => s.kind === "Weekly").map((s) => [s, s.quantity]));
  for (const line of sectionLines(weekMenu, "Staples this week")) {
    if (!line.trim()) continue;
    const item = line.match(/^\s*[-*]\s+(skip|extra|ask staples?)\s*:\s*(.+)$/i);
    if (!item) {
      throw new NoteError(weekMenu.file, `can't read "${line.trim()}" under Staples this week (expected "- Skip: …", "- Extra: …" or "- Ask Staples: …")`);
    }
    const change = item[1].toLowerCase();
    for (const part of item[2].split(",")) {
      const m = part.trim().match(/^(.+?)(?:\s*[×x]\s*(\d+))?$/);
      const name = m?.[1].trim() ?? "";
      const staple = staples.find((s) => sameIngredient(s.name, name));
      if (!staple) throw new NoteError(weekMenu.file, `"${name}" under Staples this week is not in ${STAPLES_NOTE}`);
      const count = m?.[2] === undefined ? undefined : Number(m[2]);
      const now = chosen.get(staple) ?? 0;
      if (change === "skip") chosen.set(staple, count === undefined ? 0 : Math.max(0, now - count));
      else if (change === "extra") chosen.set(staple, now + (count ?? 1));
      else chosen.set(staple, count ?? staple.quantity);
    }
  }
  return [...chosen].filter(([, quantity]) => quantity > 0).map(([staple, quantity]) => ({ ...staple, quantity }));
}

/**
 * The Staples note's table: Staple | AH product | AH id | Quantity (packs) | Kind (Weekly or Ask).
 * The webshop id may also sit in brackets at the end of the AH product cell, without an AH id column.
 */
async function readStaples(vault: string): Promise<Staple[]> {
  let note: Note;
  try {
    note = await readNote(path.join(vault, STAPLES_NOTE));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return (tableRows(note, "staple") ?? []).map((row) => {
    const product = row["ah id"]?.match(/^\d+$/)?.[0] ?? row["ah product"]?.match(/\((\d+)\)\s*$/)?.[1];
    const quantity = Number(row.quantity);
    const kind = row.kind?.toLowerCase();
    if (!row.quantity || !Number.isFinite(quantity) || quantity < 0) throw new NoteError(note.file, `the Staple "${row.staple}" has no quantity`);
    if (kind !== "weekly" && kind !== "ask") throw new NoteError(note.file, `the Staple "${row.staple}" is neither Weekly nor Ask`);
    const title = (row["ah product"] ?? "").replace(/\s*\(\d+\)\s*$/, "");
    return { name: row.staple, product: product ? Number(product) : null, title, quantity, kind: kind === "weekly" ? "Weekly" : "Ask" };
  });
}
