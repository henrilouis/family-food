# Apple Notes: the "Family food" folder

The partner takes part through three notes in the shared Apple Notes folder "Family food" (ADR 0001). The `food` CLI reads and writes them through AppleScript on this Mac (`cli/adapters/apple-notes/`).

| Note | Who writes | The CLI |
|---|---|---|
| Food wishes | both adults, one Wish per line | `food notes wishes [--json]`, `food notes wishes delete <wish>... [--json]` |
| Recipes to add | both adults: URLs, or a pasted recipe | `food notes recipes-to-add [--json]`, `food notes recipes-to-add remove <item>... [--json]` |
| This week | only `food publish` | rewritten at the end of every `food publish` |

- The first line of a note is its name, so it is never listed or deleted.
- Wishes: blank lines and typed list markers (`- `, `• `) are left out. Deleting matches the Wish as listed (case and spacing aside) and deletes every line holding it.
- Recipes to add: items are separated by blank lines; a block of bare URLs gives one item per URL. A pasted recipe that has blank lines in it comes out as several items: remove them all once it is imported. Give items exactly as `--json` lists them (multi-line items as one argument with newlines).
- Deleting keeps the other lines and their formatting, but Notes rewrites the whole note on every write, so checklist ticks may be lost.
- After every write the CLI reads the note back; a change Notes accepted but didn't keep counts as a failure.

## When Notes won't take a change

It is unconfirmed whether AppleScript can write to a note shared by another Apple ID. Writes to notes owned by this Mac's Apple ID and shared with the partner work, including deleting lines the partner added (checked on macOS 26.7.3, #25). When a write fails:

- `delete` / `remove` delete nothing, exit **2** and print what to delete by hand. With `--json`:
  ```json
  { "deleted": [], "notFound": ["Pizza"], "deleteByHand": ["Pasta pesto"], "error": "Apple Notes: …" }
  ```
  `notFound` items were already gone; nothing to do. The skills then read only and give the adult the `deleteByHand` list.
- `food publish` prints `Warning: This week note not updated: …` and still exits 0. The Kitchen Display part is unaffected.
- A note that can't be read at all (Notes not allowed, folder or note missing) makes the list commands exit 1 with the reason; `delete` / `remove` return every item in `deleteByHand`.

The tests use a fake (`fakes["apple-notes"]` in the local config): `notes.json` holds the note bodies as HTML, and `fake.json` `{ "writes": "fail" }` or `{ "writes": "ignore" }` simulates a refused or a silently dropped write. Under tests the real Apple Notes is switched off.

## Checking it by hand against the real shared folder

Do this once on the Mac, with the partner at hand, and record the result on issue #25. Nothing here touches the partner's own Wishes: it only adds and deletes test lines.

1. `food config` must not list `apple-notes` under `fakes`. Check that Notes on the Mac shows the folder "Family food" with the notes "Food wishes", "Recipes to add" and "This week" (make the missing ones, as the partner would, from the partner's iPhone). Write down who owns the folder and who created each note.
2. **Read.** Run `food notes wishes --json`. The first time, macOS asks whether the terminal may control Notes: allow it (later: System Settings → Privacy & Security → Automation). Expect the Wishes as a JSON list. Run `food notes recipes-to-add --json` too.
3. **Delete a Wish.** On the partner's iPhone, add the line `test wish from food` to Food wishes and wait until it shows on the Mac. Run `food notes wishes delete "test wish from food" --json`.
   - Works: exit 0, `"deleted": ["test wish from food"]`. On the partner's iPhone the line is gone within a few minutes and the other Wishes are still there; check again after 10 minutes that it didn't come back.
   - Fails: exit 2 with `deleteByHand` and an `error`. Copy the error. Delete the line by hand.
4. **Remove a recipe to add.** On the partner's iPhone, add the line `https://example.com/test-recipe` to Recipes to add, then run `food notes recipes-to-add remove "https://example.com/test-recipe" --json`. Check as in step 3.
5. **This week.** Run `food publish` (the Pi may be out of reach; that's fine). Expect `This week note updated.` or `Warning: This week note not updated: …`. On the partner's iPhone, This week should show the current and upcoming Week Menus.
6. Note whether formatting in Food wishes (bullets, checklist) survived step 3.
7. Record on issue #25: macOS version, folder and note owners, and for steps 2–5 whether it worked, any error text, and whether the change reached the partner's iPhone. If writes fail, the read-only fallback is what the skills use from then on.
