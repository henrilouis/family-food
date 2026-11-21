import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppleNotesError, AppleNotesWriteError, FOLDER, type NotesClient } from "./client.ts";

/**
 * The fake Apple Notes. Its state is plain JSON in `folder`, so tests can seed and inspect it:
 * - `notes.json`: the notes of the Family food folder, note name → body HTML as Notes gives it
 * - `fake.json`: how it behaves; `{ "writes": "fail" }` refuses every write (as a note shared by another
 *   Apple ID might), `{ "writes": "ignore" }` accepts writes but keeps the old body
 */
export function fakeNotesClient(folder: string): NotesClient {
  const read = async <T>(file: string, empty: T): Promise<T> => {
    try {
      return JSON.parse(await readFile(path.join(folder, file), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty;
      throw error;
    }
  };
  const notes = () => read<Record<string, string>>("notes.json", {});

  return {
    async readBody(note) {
      const body = (await notes())[note];
      if (body === undefined) throw new AppleNotesError(`No note "${note}" in the Apple Notes folder "${FOLDER}" (fake ${folder}).`);
      return body;
    },
    async writeBody(note, html) {
      const { writes } = await read<{ writes?: "fail" | "ignore" }>("fake.json", {});
      if (writes === "fail") throw new AppleNotesWriteError(`Notes refused the change to "${note}" (fake ${folder}).`);
      if (writes === "ignore") return;
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, "notes.json"), JSON.stringify({ ...(await notes()), [note]: html }, null, 2) + "\n");
    },
  };
}
