# Family food

The household's dinner planning and Albert Heijn Basket. The Recipe Vault syncs with Obsidian Sync to the iPhone and to the Boox in the kitchen, which opens it in Obsidian (ADR 0003). See `GLOSSARY.md` for the vocabulary and `docs/adr/` for the main decisions.

## Layout

- `cli/`: the `food` CLI (TypeScript, run directly by Node ≥ 24)
- `ahdump/`: the AH client, a Go tool on appie-go that the CLI runs (see `ahdump/README.md`)
- `samples/`: a small sample Recipe Vault and sample fill-basket matches (`samples/basket/`), used by the tests
- `docs/obsidian-sync-setup.md`: moving the vault to Obsidian Sync, and setting up the iPhone and the Boox
- `docs/meal-properties.md`: the Meal properties and the fixed `cuisine` and `base` lists, which `food vault check` reads
- `docs/apple-notes.md`: the shared "Family food" Apple Notes, the `food notes` commands and the checks to do by hand
- `docs/backfill.md`: how the real recipes were moved into the Recipes vault, and what was decided on the way

## Setup

```sh
npm install
npm link                                  # puts `food` on your PATH
food config vault ~/Obsidian/Recipes
food publish                              # after editing in Obsidian: send the Week Menus to the This week note
```

Keep Obsidian open on the Mac while working: Obsidian Sync only syncs while it runs. `food plan context`, `food basket lines` and `food publish` warn when it doesn't.

## Albert Heijn

```sh
npm run build:ahdump                      # needs Go
food ah login                             # once, in your browser
food ah search kikkererwten --need 400g   # cleaned up, cheapest per kg first
food ah bought melk                       # what the household bought before
food ah basket                            # Mijn lijst as JSON
food ah recipes linzen --season winter    # Allerhande's vegetarian main courses, with ratings (JSON)
food ah suggestions <allerhande url>      # AH's product for each ingredient of an Allerhande recipe (JSON)
food basket lines --week 2026-11-21       # the week's ingredient lines with their Pinned Products (JSON)
food products pin pins.json               # add or replace Pinned Products in Products.md
food basket fill --week 2026-11-21 matches.json   # see samples/basket/ for the Matches format
```

Say "fill the Basket" to the agent (the Planning Session does it after "lock it"): the `fill-basket` skill (`.agents/skills/fill-basket/SKILL.md`) matches the week's ingredient lines to AH products, asks about new Matches and Cupboard Ingredients in one message, pins what the adult confirms and runs `food basket fill`.

`food basket lines` gives each line its ready `match` for `food basket fill` when it has a Pinned Product, with the share of a pack worked out from the Pack column where the amounts compare (g, ml, spoons, tins, pieces with "1 kg ≈ 8 onions").

`food basket fill` is what the fill-basket skill runs once the Matches are confirmed. It reads the Week Menu, `Staples.md` and the Recipes, adds to Mijn lijst (never removes; an ingredient or chosen Staple without an AH product goes in as a free-text note), writes the Week Menu's `## Basket` section and prints a report. When the week's empty order is open for changes in the AH app (picked when ordering from Mijn lijst), AH puts the products straight into that order and the notes in Mijn lijst; the report says so and to submit the order before it closes. The delivery subscription's empty orders don't count as placed. Run again after a menu change, it adds only the difference with `## Basket` and lists what is no longer needed. It exits 2 when it wrote nothing to AH and someone has to act on its output:

- an order delivering in the Week Menu's week (the Saturday slot, or another slot on the Late path) is already placed: add-multiple links (25 products each) and a grouped shopping list, or, when the Basket was filled before checkout and the menu changed since, an add-and-remove list for Mijn bestellingen;
- an order for another week is open for changes in the AH app, so AH would put the products into it: submit it or undo its changes, then fill again;
- the AH login failed, also after logging in again once in the browser: add-multiple links and the shopping list;
- AH doesn't answer (ordering down): the shopping list without ids, also written into `## Basket`.

The AH token is kept in the local config folder with mode 600, never in the Recipe Vault. The tests use a fake AH; `ahdump/README.md` lists the checks to do by hand against the live API.

## Apple Notes

```sh
food notes wishes --json                       # the Wishes in "Food wishes"
food notes wishes delete "Pasta pesto" --json  # exit 2 + "deleteByHand" when Notes won't take the change
food notes recipes-to-add --json               # URLs and pasted recipes in "Recipes to add"
```

`food publish` rewrites the "This week" note. See `docs/apple-notes.md`, including the checks to do by hand against the real shared folder.

## Adding recipes

Ask the agent to add a recipe (a URL or pasted text), or to import "Recipes to add": the `add-recipe` skill (`.agents/skills/add-recipe/SKILL.md`) writes it to the vault in the template. It replaces the old work vault's copy of that skill. The CLI parts it uses:

```sh
food recipe fetch https://cookieandkate.com/best-lentil-soup-recipe/   # the page's schema.org Recipe (and rating) as JSON
food recipe published "Best Lentil Soup"                                # is it on a published Week Menu?
```

`food recipe fetch` says who it is (an honest User-Agent) and never fetches from NYT Cooking, Serious Eats or The Guardian, whose robots.txt blocks AI agents; paste those recipes instead. Allerhande recipes (`ah.nl/allerhande/recept/R-R…`) are read through AH's app API instead, because ah.nl blocks automated reads of its pages. Under tests it fetches only from local test pages.

## Planning the week

Say "plan the week" to the agent: the `planning-session` skill (`.agents/skills/planning-session/SKILL.md`) reviews last week's Novel Recipe, proposes next week's Week Menu with three Novel Recipe candidates, settles the Staples and, on "lock it", writes the Week Menu, saves the Novel Recipe through `add-recipe`, deletes the honoured Wishes, Publishes and hands off to fill-basket. It replaces the old work vault's `week-menu` skill. The CLI parts it uses:

```sh
food plan context                          # the week to plan, the Novel Recipe to review, the repeat window, the Meals (JSON)
food plan verdict 2026-11-21 kept          # kept | rejected | "not cooked"
food plan sites                            # each recipe site's Novel Recipes kept / rejected / not cooked, and its Meals (JSON)
food recipe delete "Vegetable Biryani"     # after a confirmed 👎; the Week Menus keep its name as plain text,
                                           # which This week shows as "Vegetable Biryani (deleted)"
food plan write week-menu.json             # the Locked Week Menu note
```

## Local config

The local config lives in `~/Library/Application Support/family-food/` (`FOOD_CONFIG_DIR` overrides it). `FOOD_NOW` fixes the CLI's clock. The config's `fakes` key swaps an adapter for its fake, which keeps its state as JSON files in the folder given (`{ "fakes": { "ah": "/tmp/x/ah", "apple-notes": "/tmp/x/notes", "obsidian": "/tmp/x/obsidian" } }`); the tests use this.

## Tests

```sh
npm test
npm run typecheck
```

`vitest.config.ts` sets `FOOD_FAKES_ONLY=1` for every test and the CLI processes they start: the real AH, Apple Notes and recipe sites off this Mac then refuse, so a test that forgets its fake reaches nothing real, and Obsidian counts as running.
