import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

/** Notes as the Notes app's AppleScript `body` gives them: HTML, the first line being the note's name. */
const seed = (folder: string, notes: Record<string, string>) =>
  writeFile(path.join(folder, "notes.json"), JSON.stringify(notes, null, 2));
const notes = async (folder: string): Promise<Record<string, string>> =>
  JSON.parse(await readFile(path.join(folder, "notes.json"), "utf8"));

const wishesNote = [
  "<div><h1>Food wishes</h1></div>",
  "<div>Pasta pesto</div>",
  "<div>Something with &amp; aubergine</div>",
  "<div><br></div>",
  "<ul>",
  "<li>Easy week</li>",
  "</ul>",
].join("\n");

describe("Food wishes", () => {
  test("food notes wishes lists one Wish per line, without the note's title", async () => {
    const { run, fake } = await sandbox();
    await seed(await fake("apple-notes"), { "Food wishes": wishesNote });

    const result = await run(["notes", "wishes", "--json"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(["Pasta pesto", "Something with & aubergine", "Easy week"]);
  });

  test("deleting Wishes leaves the rest of the note as it was and reports Wishes it couldn't find", async () => {
    const { run, fake } = await sandbox();
    const folder = await fake("apple-notes");
    await seed(folder, { "Food wishes": wishesNote });

    const result = await run(["notes", "wishes", "delete", "Pasta pesto", "Easy week", "Pizza", "--json"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ deleted: ["Pasta pesto", "Easy week"], notFound: ["Pizza"], deleteByHand: [], error: null });
    expect(JSON.parse((await run(["notes", "wishes", "--json"])).stdout)).toEqual(["Something with & aubergine"]);
    expect((await notes(folder))["Food wishes"]).toBe(
      ["<div><h1>Food wishes</h1></div>", "<div>Something with &amp; aubergine</div>", "<div><br></div>", ""].join("\n"),
    );
  });

  test("when Notes refuses the change, nothing is deleted and the Wishes come back as a delete-by-hand list", async () => {
    const { run, fake } = await sandbox();
    const folder = await fake("apple-notes");
    await seed(folder, { "Food wishes": wishesNote });
    await writeFile(path.join(folder, "fake.json"), JSON.stringify({ writes: "fail" }));

    const json = await run(["notes", "wishes", "delete", "Pasta pesto", "Pizza", "--json"]);
    const text = await run(["notes", "wishes", "delete", "Pasta pesto", "Easy week"]);

    expect(json.code).toBe(2);
    expect(JSON.parse(json.stdout)).toMatchObject({ deleted: [], notFound: ["Pizza"], deleteByHand: ["Pasta pesto"] });
    expect(JSON.parse(json.stdout).error).toMatch(/refused/);
    expect(text.code).toBe(2);
    expect(text.stdout).toContain('Please delete these from "Food wishes" by hand:\n- Pasta pesto\n- Easy week\n');
    expect((await notes(folder))["Food wishes"]).toBe(wishesNote);
  });

  test("a change Notes accepts but doesn't keep also comes back as a delete-by-hand list", async () => {
    const { run, fake } = await sandbox();
    const folder = await fake("apple-notes");
    await seed(folder, { "Food wishes": wishesNote });
    await writeFile(path.join(folder, "fake.json"), JSON.stringify({ writes: "ignore" }));

    const result = await run(["notes", "wishes", "delete", "Easy week", "--json"]);

    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ deleted: [], deleteByHand: ["Easy week"], error: expect.stringMatching(/didn't keep/) });
  });

  test("when the note can't be read, every Wish to delete is left for an adult", async () => {
    const { run, fake } = await sandbox();
    await fake("apple-notes");

    const result = await run(["notes", "wishes", "delete", "Pasta pesto", "--json"]);

    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ deleted: [], notFound: [], deleteByHand: ["Pasta pesto"] });
    expect(JSON.parse(result.stdout).error).toContain('No note "Food wishes"');
  });
});
