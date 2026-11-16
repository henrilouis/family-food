---
name: add-recipe
description: Add a Recipe to the Recipe Vault from a URL or pasted text, in English, metric and the vault's template. Use when an adult wants to add or save a recipe, to import the shared "Recipes to add" Apple Note, or when the Planning Session saves its Novel Recipe at lock.
---

# add-recipe

Turn one recipe (a URL or pasted text) into a Recipe note in the Recipe Vault that `food vault check` passes and the Kitchen Display can cook from. Vocabulary is from `GLOSSARY.md`. The `food` CLI does everything deterministic; run it from this repo (`node cli/food.ts …` if `food` isn't on the PATH).

The vault is the `vault` path in `food config`. Its recipe folders are `Meals`, `Sides` and `Baking`.

## Callers

- **An adult** gives a URL or pastes a recipe. Write `novel: false`.
- **The Planning Session**, at lock, hands over the chosen Novel Recipe with `novel: true`, the title it already linked from the Week Menu, and the folder `Meals`. Use that title exactly, so the Week Menu's link resolves. Skip step 8: the Planning Session publishes right after you. Report back the note's path, or why you refused.
- **"Recipes to add"**: an adult asks to import the shared note. Follow [Recipes to add](#recipes-to-add), which runs the steps below once per item.

## Steps

1. **Read the recipe.**
   - URL: run `food recipe fetch <url>`. It prints the recipe as JSON (title, servings, yield, minutes, ingredients, steps, the site's cuisine and diet hints, language): from the page's schema.org Recipe, or for an Allerhande recipe (`https://www.ah.nl/allerhande/recept/R-R<number>/…`) from AH's app API.
     - Exit 2: a site the household never fetches from (NYT Cooking, Serious Eats, The Guardian), or an ah.nl page that isn't an Allerhande recipe. Ask the adult to paste the recipe text; reading the page any other way is off limits.
     - Exit 3 (no recipe data), or `steps` is empty: read the page with your own web-fetch tool and take the recipe from it. This never applies to ah.nl, which blocks it: ask for the text.
     - Exit 1 on an Allerhande URL: AH's app API didn't answer or has no such recipe. Pass the message on and ask the adult to paste the recipe text or try later.
   - Allerhande recipes are Dutch, with decimal commas ("1,2 kg"). `prepMinutes` is Allerhande's hands-on time (bereidingstijd), `cookMinutes` its oven time, `totalMinutes` both plus any waiting. Its `vegetarisch` tag is a hint like any site's diet label: step 2 still applies.
   - Pasted text: use it as given.
   - Take ingredients and steps only from the source. When ingredients, amounts or the method are missing or unclear, ask the adult (all questions in one message) rather than filling the gaps.
   Done when you have the title, every ingredient line and every step.

2. **Check for meat and fish**, ingredient by ingredient, in every language the source uses. The site's diet labels are hints, never proof. Eggs and dairy are fine.
   - **Refuse** when meat or fish is a main part of the dish (chicken curry, tuna pasta, bolognese with beef): write nothing, and say which ingredient it is.
   - **Swap** a minor animal ingredient that has a usual vegetarian stand-in, and flag the swap: stock (vegetable stock), fish sauce (soy sauce or vegetarian fish sauce), oyster sauce (vegetarian oyster sauce), Worcestershire sauce (vegetarian Worcestershire sauce), shrimp paste / terasi / belacan (miso or leave out), gelatine (agar-agar), a bacon, speck or ham garnish (leave out or smoked paprika). Write the swap in the note's notes paragraph ("Vegetarian version: fish sauce replaced by soy sauce.") and in your report.
   - Words to catch include: meat, chicken, beef, pork, lamb, veal, duck, turkey, bacon, pancetta, speck, ham, prosciutto, chorizo, salami, sausage, mince, lard, suet, gelatine, fish, anchovy, tuna, salmon, prawn, shrimp, mussel, squid, dashi, bonito; Dutch vlees, kip, rund, gehakt, varken, spek, ham, worst, lam, vis, zalm, tonijn, garnalen, ansjovis, vissaus, oestersaus, bouillon (check which). Plant-based versions ("vega gehakt", "vegetarian mince") are fine.
   Done when every ingredient line is cleared, swapped or the recipe is refused.

3. **Choose the folder**: `Meals` for a dinner's main dish, `Sides` for something served with one (rice, bread, salads, sauces, condiments, drinks, ice cream), `Baking` for bread, cakes, pastries, pizza dough and cookies. When it could go either way, ask the adult.

4. **Look for a duplicate**: the same title in any recipe folder, or the same source URL (`grep -rl "<url>" <vault>/Meals <vault>/Sides <vault>/Baking`). If one exists, stop and ask the adult whether to replace it, keep both under another title, or skip.

5. **Bring it to house style** (see [The Recipe note](#the-recipe-note)):
   - English (British names, as in the vault: aubergine, courgette, coriander, chickpeas, spring onion). Keep a dish's own name where English uses it too (Bami Goreng, Shakshuka).
   - Metric (see [Units](#units)).
   - One dinner: if the recipe is written for two dinners or meal prep ("makes two meals", "double it for us"), bring it back to one dinner. Otherwise keep the amounts and `serves` as written; the household doesn't rescale.
   - Every Method step writes each ingredient it uses with its amount, italic, right where it's used.
   Done when every ingredient line has its amount (or none, for "to taste" lines) and every amount in the list is used up across the steps.

6. **Write the note** at `<vault>/<Folder>/<Title>.md`. The filename is the H1 title with `/ \ : * ? " < > | # ^ [ ]` left out. A Meal gets the properties below; a Side or Baking recipe gets none, and its source goes in a last notes line: `Source: <url>`.

7. **Check it**: run `food vault check --json` and fix every error and warning whose `file` is your note (`Meals/<Title>.md`, …). Problems in other notes aren't yours: mention them in the report and leave those notes as they are.
   Done when the check lists nothing for your note.

8. **Publish when it shows**: run `food recipe published "<Title>"`. If it names a Week Menu, run `food publish`:
   - exit 0, "Kitchen Display updated…": done.
   - exit 0, "Kitchen Display not updated, run `food publish` at home": the Pi is out of reach; the note stands. Pass the message on.
   - exit 1: check errors. Fix the ones in your note and run it again; report the others.

9. **Report** in a few lines: the note's path and folder; for a Meal, the property values you guessed (`reviewed: false`, so the adult can correct them in the `Meal review` Base); any vegetarian swap; any amount or conversion you weren't sure of; the Publish result.

Your writes are the new note (and fixes to it) and, for Recipes to add, removing imported items. Week Menus are history: read them, never edit them. Household, Staples and Products stay as they are.

## Recipes to add

1. `food notes recipes-to-add --json` lists the items: each URL alone, and a pasted recipe as one item. A pasted recipe with blank lines in it comes out as several consecutive items: treat those as one recipe and keep every piece's exact text for the removal. Exit 1 means Notes couldn't be read (Automation permission, folder or note missing): pass the reason on and stop here.
2. Import each recipe with the steps above. Ask the questions for all items in one message where you can.
3. After each successful import (step 7 done), remove its item or items, passing the exact listed text (a multi-line item is one argument with its newlines): `food notes recipes-to-add remove <item>... --json`.
   - Exit 0: removed (`notFound` items were already gone).
   - Exit 2: Notes won't take the change. From then on in this session, only read the note: collect every imported item's text, and end your report with "Please delete these from "Recipes to add" by hand:" and that list.
4. Leave refused and failed items in the note; list each with its reason in the report.

## The Recipe note

```markdown
---
serves: 4
active_minutes: 30
total_minutes: 45
cuisine: Middle Eastern
base:
  - legumes
  - bread/wrap
double: true
source: https://www.example.com/chickpea-stew/
sides:
  - "[[Naan]]"
novel: false
reviewed: false
---
# Lemony Chickpea Stew

## Ingredients

- *2 tbsp* olive oil
- *1* onion, finely chopped
- *2 tins (400 g)* chickpeas, drained
- *1 l* vegetable stock
- *1* lemon, juiced
- salt and pepper

### To serve

- *4* flatbreads

## Method

1. Heat *1 tbsp* olive oil in a large pan and fry *1* onion for 5 minutes.
2. Add *2 tins* chickpeas and *1 l* vegetable stock and simmer for 20 minutes.
3. Stir in the juice of *1* lemon and season with salt and pepper. Drizzle with the remaining *1 tbsp* olive oil and serve with *4* flatbreads.

Keeps for three days in the fridge; it thickens, so add a splash of water when reheating.
```

**Properties** (Meals only, in this order; the meanings and the fixed lists are in `docs/meal-properties.md`, read it):
- `serves`: portions as written for one dinner, a whole number. Above 6 usually means two dinners (the check warns).
- `active_minutes` (hands-on) and `total_minutes` (including oven, soaking, rising): from the source's times when they look right, otherwise estimated from the Method. Weekday dinners are planned with `active_minutes` ≤ 45, so estimate honestly.
- `cuisine`: one value from the fixed list; `base`: values from the fixed list, following that doc's rules.
- `double`: true when it reheats well and scales to two days (curries, stews, chili, soups, bakes); false for crisp, fried, fresh or delicate dishes.
- `source`: the recipe's URL, as `url` in `food recipe fetch`'s output (for Allerhande, fill-basket reads AH's product suggestions from it); empty (`source:`) for pasted text without one.
- `sides`: wikilinks to notes that exist in `Sides`, default first; `[]` when none fits.
- `novel`: true only from the Planning Session. `reviewed`: always false.

**Body**:
- `# Title` in title case, matching the filename.
- `## Ingredients`: one `- ` line each, the amount first in italics (`*200 g*`, `*2 tbsp*`, `*1*`, `*2 tins (400 g)*`), then the ingredient and its preparation. Lines without a measurable amount ("salt and pepper", "oil for frying") have no italics. Optional `### Subsection` headings (Sauce, Dough, To serve) group lines.
- `## Method`: a numbered list. Each step writes the amount of every ingredient it uses in the same italic form, followed by the ingredient's name as the list writes it (same words, same singular or plural), because the Kitchen Display bolds that span. An ingredient used in several steps gets its share in each ("*1 tbsp* olive oil" … "the remaining *1 tbsp* olive oil"), adding up to the list's amount.
- Italics only for amounts that scale when the dinner is doubled. Times, temperatures, pan and tin sizes and piece sizes stay plain ("for 20 minutes", "200°C", "a 20 cm tin", "2 cm cubes"), and nothing else is italic: `food vault check` reads every italic span in a step as an amount that must start with a number.
- A range becomes one number (the middle, or the usual choice), with the range kept in the text when it matters ("*3* cloves garlic (2–4)"), because the display doubles the leading number only.
- Notes (tips, variations, storage, vegetarian swaps, a Side's or Baking recipe's `Source:`) go in plain paragraphs after the Method, separated from it by a blank line. No `## Notes` or `## Source` heading, no `*Serves N*` line.

## Units

The Basket and the display understand g, kg, ml, l, tsp, tbsp, tins and pieces.
- 1 US cup of liquid = 240 ml. A cup of a dry ingredient becomes grams of that ingredient (flour 125 g, sugar 200 g, rice 185 g, oats 90 g, grated cheese 100 g, chopped vegetables about 150 g); when unsure, use ml and say so in the report.
- 1 oz = 28 g (round sensibly: 8 oz → 225 g), 1 lb = 450 g, 1 fl oz = 30 ml, 1 quart = 950 ml, 1 inch = 2.5 cm.
- A "15-ounce can" is a 400 g tin: `*1 tin (400 g)*`.
- °F → °C, rounded to 5 (350°F → 180°C). Fan ovens: say "fan" if the source does.
- Keep tsp and tbsp; write a stick of butter as 115 g.
