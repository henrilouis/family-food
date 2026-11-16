# Backfill into the Recipes vault (#26)

A one-off migration, run on 2026-11-16 on the adult's Mac, that moved the recipes from the old work Obsidian vault (`Notes/Recipes/`) into the dedicated iCloud vault `Recipes`. It is recorded here so later skills know where the data came from and what was decided along the way.

## Where things are

- **New vault**: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Recipes`. The local `food` config points at it.
- **Snapshot of the old recipes**, taken before anything else: `~/Documents/family-food-backup/Recipes-snapshot-2026-11-16/` and `Recipes-snapshot-2026-11-16.tar.gz` next to it. It still holds the `Meat` folder.
- **Old vault**: left untouched. Removing `Notes/Recipes/` from it is a manual step (see below).

## What the new vault holds

| Path | Contents |
|---|---|
| `Meals/` | 49 Meals, each with the full property set and `reviewed: false` |
| `Sides/` | 11 Sides (renamed from "Sides or other"), no properties |
| `Baking/` | 7 Baking recipes, no properties |
| `Week menus/` | `Week 2026-15`, the old Week Menu, kept as history |
| `AH purchase history/` | moved as is (receipts, orders, `lines.jsonl`) |
| `Household.md` | Household Preferences: empty Never, Less and Kids sections |
| `Staples.md` | the Staples table seeded from #9 |
| `Products.md` | Pinned Products: an empty table |
| `Meal review.base` | Obsidian Base with a "To review" table of Meals whose `reviewed` isn't ticked, and an "All Meals" table |
| `Coffee.md`, `Salty Canadian Ice Coffee.md` | coffee notes from the old Recipes root, translated, without properties |

The `Meat` folder (6 recipes) was dropped; it exists only in the snapshot. There is no `Wishes.md`.

## What changed in the recipes

- **Meals and Sides** were translated to English (titles, file names and the wikilinks in `Week 2026-15`), converted to metric (cups, ounces, inches, pounds, quarts and °F), and brought to the recipe template: H1 title, `*amount* ingredient` lines, a numbered Method that writes every scalable amount where it's used, notes as a plain paragraph after the Method, servings and source as properties.
- **Ranges** in amounts became one number (the middle or the usual choice), with the range kept in the ingredient's text where it matters, because the display doubles the leading number only.
- **Two dinners → one**: Roasted Sweet Potato and Black Bean Burrito Bowls was written for 3 people × 2 dinners and was halved. Perfect Egg Fried Rice said "do recipe ×2 for us" and was doubled to one family dinner (serves 6).
- **Vegetarian**: Bolognese lost its bacon and beef options (halloumi, vegetarian mince, vegetable stock cube); Oven Potatoes lost duck or beef fat; Crispy Tofu lost fish sauce; Veggie Chili now names vegetarian Worcestershire sauce.
- **Methods with sub-methods** (Tempeh Burrito, Poke Bowl) were flattened into one numbered list; Perfect Egg Fried Rice keeps the wok method and has the frying-pan method in its notes.
- **Stubs**: Improvised Salad and Healthy Egg Salad had ingredients but no method, and Steamed Broccoli with Lime Rice, Grilled Cashews and Tempeh had only a title. They got a short method reconstructed from what was there, with no invented amounts, and a note saying so.
- **Baking** was already in English; its files were renamed to their English titles and Pizza got an H1. Its contents are otherwise unchanged.
- A dangling image embed (`IMG_3601.jpeg`, not in the old vault) was dropped from Spinach Paneer Curry.

## Property values

All values were guessed by the agent from the recipe text and are marked `reviewed: false`; planning trusts them anyway. `serves` is the recipe's own number (one value where it gave a range); times are estimates; `double: true` was given to curries, stews, chili, bakes and soups that reheat well. `sides` were taken from the pairings in `Week 2026-15` and from the recipes themselves. See `docs/meal-properties.md` for how `cuisine` and `base` were assigned.

## Left for a human

1. Open the `Recipes` vault in Obsidian and check that `Meal review.base` opens as a table.
2. Review each Meal's properties in that Base and tick `reviewed`.
3. Remove `Notes/Recipes/` from the work vault once satisfied. The snapshot keeps a copy.
