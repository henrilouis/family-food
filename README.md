# Family food

The household's dinner planning, Albert Heijn Basket and Kitchen Display. See `GLOSSARY.md` for the vocabulary and `docs/adr/` for the main decisions.

## Layout

- `cli/`: the `food` CLI (TypeScript, run directly by Node ≥ 24)
- `display/`: the Kitchen Display page
- `bundle/`: the display bundle's shared type definition, used by both
- `ahdump/`: the AH client, a Go tool on appie-go that the CLI runs (see `ahdump/README.md`)
- `pi/`: the Kitchen Display Pi's setup script and Caddy config, run and uploaded by `food deploy`
- `samples/`: a small sample Recipe Vault, the sample bundles built from it, and sample fill-basket matches (`samples/basket/`), used by the tests
- `docs/pi-setup.md` and `docs/boox-setup.md`: flashing the Kitchen Display Pi and the Boox setup checklist
- `docs/meal-properties.md`: the Meal properties and the fixed `cuisine` and `base` lists, which `food vault check` reads
- `docs/apple-notes.md`: the shared "Family food" Apple Notes, the `food notes` commands and the checks to do by hand
- `docs/backfill.md`: how the real recipes were moved into the Recipes vault, and what was decided on the way

## Setup

```sh
npm install
npm link                                  # puts `food` on your PATH
food config vault "<path to the Recipes vault>"
food preview                              # http://localhost:8787/
food publish                              # after editing in Obsidian: send the Week Menus to the Kitchen Display
```

## Albert Heijn

```sh
npm run build:ahdump                      # needs Go
food ah login                             # once, in your browser
food ah search kikkererwten --need 400g   # cleaned up, cheapest per kg first
food ah bought melk                       # what the household bought before
food ah basket                            # Mijn lijst as JSON
food basket lines --week 2026-11-21       # the week's ingredient lines with their Pinned Products (JSON)
food products pin pins.json               # add or replace Pinned Products in Products.md
food basket fill --week 2026-11-21 matches.json   # see samples/basket/ for the matches format
```

Say "fill the Basket" to the agent (the Planning Session does it after "lock it"): the `fill-basket` skill (`.agents/skills/fill-basket/SKILL.md`) matches the week's ingredient lines to AH products, asks about new matches and Cupboard Ingredients in one message, pins what the adult confirms and runs `food basket fill`.

`food basket lines` gives each line its ready `match` for `food basket fill` when it has a Pinned Product, with the share of a pack worked out from the Pack column where the amounts compare (g, ml, spoons, tins, pieces with "1 kg ≈ 8 onions").

`food basket fill` is what the fill-basket skill runs once the matches are confirmed. It reads the Week Menu, `Staples.md` and the Recipes, adds to Mijn lijst (never removes), writes the Week Menu's `## Basket` section and prints a report. Run again after a menu change, it adds only the difference with `## Basket` and lists what is no longer needed. It exits 2 when it wrote nothing to AH and someone has to act on its output:

- the coming Saturday's order is already placed: add-multiple links (25 products each) and a grouped shopping list, or, when the Basket was filled before checkout and the menu changed since, an add-and-remove list for Mijn bestellingen;
- the AH login failed, also after logging in again once in the browser: add-multiple links and the shopping list;
- AH doesn't answer (ordering down): the shopping list without ids, also written into `## Basket`.

The AH token is kept in the local config folder with mode 600, never in the Recipe Vault. The tests use a fake AH; `ahdump/README.md` lists the checks to do by hand against the live API.

## Apple Notes

```sh
food notes wishes --json                       # the Wishes in "Food wishes"
food notes wishes delete "Pasta pesto" --json  # exit 2 + "deleteByHand" when Notes won't take the change
food notes recipes-to-add --json               # URLs and pasted recipes in "Recipes to add"
```

`food publish` also rewrites the "This week" note. See `docs/apple-notes.md`, including the checks to do by hand against the real shared folder.

## Adding recipes

Ask the agent to add a recipe (a URL or pasted text), or to import "Recipes to add": the `add-recipe` skill (`.agents/skills/add-recipe/SKILL.md`) writes it to the vault in the template. It replaces the old work vault's copy of that skill. The CLI parts it uses:

```sh
food recipe fetch https://cookieandkate.com/best-lentil-soup-recipe/   # the page's schema.org Recipe (and rating) as JSON
food recipe published "Best Lentil Soup"                                # is it on a published Week Menu?
```

`food recipe fetch` says who it is (an honest User-Agent) and never fetches from NYT Cooking, Serious Eats or The Guardian, whose robots.txt blocks AI agents; paste those recipes instead. Allerhande pages aren't supported yet. Under tests it fetches only from local test pages.

## Planning the week

Say "plan the week" to the agent: the `planning-session` skill (`.agents/skills/planning-session/SKILL.md`) reviews last week's Novel Recipe, proposes next week's Week Menu with three Novel Recipe candidates, settles the Staples and, on "lock it", writes the Week Menu, saves the Novel Recipe through `add-recipe`, deletes the honoured Wishes, Publishes and hands off to fill-basket. It replaces the old work vault's `week-menu` skill. The CLI parts it uses:

```sh
food plan context                          # the week to plan, the Novel Recipe to review, the repeat window, the Meals (JSON)
food plan verdict 2026-11-21 kept          # kept | rejected | "not cooked"
food plan sites                            # each recipe site's Novel Recipes kept / rejected / not cooked, and its Meals (JSON)
food recipe delete "Vegetable Biryani"     # after a confirmed 👎; the Week Menus keep its name as plain text
food plan write plan.json                  # the Locked Week Menu note
```

## Local config

The local config lives in `~/Library/Application Support/family-food/` (`FOOD_CONFIG_DIR` overrides it). `FOOD_NOW` fixes the CLI's clock. The config's `fakes` key swaps an adapter for its fake, which keeps its state as JSON files in the folder given (`{ "fakes": { "ah": "/tmp/x/ah", "apple-notes": "/tmp/x/notes" } }`); the tests use this.

## Kitchen Display Pi

The Pi only serves static files with Caddy over plain HTTP on the LAN (ADR 0002). To set it up, follow `docs/pi-setup.md`: flash Raspberry Pi OS Lite 64-bit with Imager presets (hostname `kitchen`, SSH key, Wi-Fi), give it a DHCP reservation, add the `kitchen` SSH alias on the Mac, then run `food deploy` and `food publish`. Then set up the Boox with `docs/boox-setup.md` (Fully Kiosk Browser, kiosk PIN, never sleep, always plugged in); Fully's exported settings go in `docs/fully-settings.json`.

`food deploy` runs `pi/setup.sh` as root on the Pi (Caddy, key-only SSH, unattended security upgrades), then uploads the page to `/srv/kitchen/page/`. Run it again to update or repair the Pi; a run that has nothing to do says so. `food publish` uploads bundles into `/srv/kitchen/releases/` and switches the `current` symlink, which Caddy serves `*.json` from.

## Tests

```sh
npm test
npm run typecheck
```

The sample bundles in `samples/bundles/` are written by the CLI tests and read by the page tests. After an intended change to the bundle, update them with `npx vitest run -u`.

The browser tests (`display/test/*.browser.test.ts`) drive the page served by `food preview` in headless Google Chrome through `playwright-core`, so Chrome must be installed. They fix the page's clock with Playwright's clock.
