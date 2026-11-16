import type { Config } from "../../config.ts";
import { AppleNotesError, AppleNotesWriteError, type NotesClient } from "./client.ts";
import { fakeNotesClient } from "./fake.ts";
import { bodyLines, parseNote, withoutLines, type Line, type ParsedNote } from "./html.ts";
import { osascriptNotesClient } from "./osascript.ts";

export { AppleNotesError, AppleNotesWriteError, FOLDER } from "./client.ts";

export const FOOD_WISHES = "Food wishes";
export const RECIPES_TO_ADD = "Recipes to add";
export const THIS_WEEK = "This week";

/**
 * What became of items asked to be deleted from a note. When Notes won't take the change (a note
 * shared by another Apple ID may be read-only), nothing is deleted and `deleteByHand` lists what an
 * adult should delete themselves.
 */
export type Deletion = {
  deleted: string[];
  /** Not in the note (any more): nothing to do. */
  notFound: string[];
  /** Still in the note because the change failed. */
  deleteByHand: string[];
  /** Why the change failed; null when it didn't. */
  error: string | null;
};

/** The three notes of the shared "Family food" folder, as the `food` CLI uses them. */
export interface FamilyNotes {
  /** The Wishes in Food wishes, one per line, blank lines and list markers left out. */
  wishes(): Promise<string[]>;
  /** Deletes the given Wishes (as `wishes()` lists them, case aside), every line holding one. */
  deleteWishes(wishes: string[]): Promise<Deletion>;
  /**
   * The items in Recipes to add: each URL on its own, and each pasted recipe as one item
   * (its lines up to a blank line). A pasted recipe holding blank lines comes out as several items.
   */
  recipesToAdd(): Promise<string[]>;
  /** Removes the given items (as `recipesToAdd()` lists them) once imported. */
  removeRecipesToAdd(items: string[]): Promise<Deletion>;
}

/** The Family food notes: the fake when the local config names a folder in `fakes["apple-notes"]`, else the Notes app. */
export function familyNotes(config: Config): FamilyNotes {
  const fake = config.fakes?.["apple-notes"];
  const client: NotesClient = fake ? fakeNotesClient(fake) : osascriptNotesClient();
  const read = async (note: string) => parseNote(await client.readBody(note));

  /** Deletes the items of `note` matching `requested`, checking afterwards that Notes kept the change. */
  const deleteItems = async (note: string, requested: string[], itemsOf: (note: ParsedNote) => Item[]): Promise<Deletion> => {
    const result: Deletion = { deleted: [], notFound: [], deleteByHand: [], error: null };
    try {
      const parsed = await read(note);
      const items = itemsOf(parsed);
      const lines = new Set<Line>();
      for (const wanted of requested) {
        const matches = items.filter((item) => same(item.text, wanted));
        (matches.length ? result.deleted : result.notFound).push(wanted);
        for (const item of matches) for (const line of item.lines) lines.add(line);
      }
      if (lines.size === 0) return result;
      await client.writeBody(note, withoutLines(parsed, lines));
      const left = itemsOf(await read(note));
      if (result.deleted.some((wanted) => left.some((item) => same(item.text, wanted)))) {
        throw new AppleNotesWriteError(`Apple Notes didn't keep the change to "${note}".`);
      }
      return result;
    } catch (error) {
      if (!(error instanceof AppleNotesError)) throw error;
      const notFound = error instanceof AppleNotesWriteError ? result.notFound : [];
      return {
        deleted: [],
        notFound,
        deleteByHand: requested.filter((wanted) => !notFound.includes(wanted)),
        error: error.message,
      };
    }
  };

  return {
    async wishes() {
      return wishItems(await read(FOOD_WISHES)).map((item) => item.text);
    },
    deleteWishes: (wishes) => deleteItems(FOOD_WISHES, wishes, wishItems),
    async recipesToAdd() {
      return recipeItems(await read(RECIPES_TO_ADD)).map((item) => item.text);
    },
    removeRecipesToAdd: (items) => deleteItems(RECIPES_TO_ADD, items, recipeItems),
  };
}

/** An item of a note (a Wish, a recipe to add) and the lines it takes up. */
type Item = { text: string; lines: Line[] };

function wishItems(note: ParsedNote): Item[] {
  return bodyLines(note)
    .map((line) => ({ text: itemText(line.text), lines: [line] }))
    .filter((item) => item.text !== "");
}

/** Paragraphs (split by blank lines), a paragraph of only URLs giving one item per URL. */
function recipeItems(note: ParsedNote): Item[] {
  const paragraphs: Line[][] = [[]];
  for (const line of bodyLines(note)) {
    if (line.text === "") paragraphs.push([]);
    else paragraphs[paragraphs.length - 1].push(line);
  }
  return paragraphs
    .filter((lines) => lines.length > 0)
    .flatMap((lines) => (lines.every((line) => URL_LINE.test(itemText(line.text))) ? lines.map((line) => [line]) : [lines]))
    .map((lines) => ({ text: lines.map((line) => itemText(line.text)).join("\n"), lines }));
}

const URL_LINE = /^https?:\/\/\S+$/;

/** A line as written, without a typed list marker ("- ", "• "). */
const itemText = (line: string) => line.replace(/^[-*•–]\s+/, "").trim();

const normal = (text: string) =>
  text
    .split("\n")
    .map((line) => itemText(line).replace(/\s+/g, " ").toLowerCase())
    .join("\n");
const same = (a: string, b: string) => normal(a) === normal(b);
