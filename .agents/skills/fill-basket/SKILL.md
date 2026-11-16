---
name: fill-basket
description: Fill the Albert Heijn Basket (Mijn lijst) for a Locked Week Menu, from ingredient lines to AH products. Use when an adult asks to fill the Basket or order the week's groceries, when the Planning Session hands off after "lock it", or to fill it again after a Locked Week Menu changed.
---

# fill-basket

Turn a Locked Week Menu and its Staples into AH products in Mijn lijst. Vocabulary is from `GLOSSARY.md`. You hold the judgement: translating each ingredient line to Dutch, choosing its product, its kind and its pack fraction. The `food` CLI does the rest (Doubles, Staples, sums, rounding, the write to AH, the `## Basket` section, the report); run it from this repo (`node cli/food.ts …` if `food` isn't on the PATH). The vault is the `vault` path in `food config`.

Your writes are Products.md (through `food products pin`) and Mijn lijst (through `food basket fill`). An adult always checks out. Whatever happens with AH, the Locked Week Menu stands.

## Callers

- **The Planning Session**, at lock, names the week (`week_start`). On the Late path it also says how the household shops: another AH slot (fill Mijn lijst as usual; the checkout is into that slot) or a store trip (Mijn lijst is then the shopping list in the AH app; leave out the checkout reminder).
- **An adult**: "fill the Basket". Also run again after a Locked Week Menu changed: the CLI adds only the difference and lists what is no longer needed.

## Steps

### 1. Find the week

Use the week the Planning Session named. Otherwise run `food plan context` and take `week.weekStart` when `week.exists` is true. When it is false, next week isn't Locked yet: say so and offer to plan it, unless the adult names a Week Menu that is (use its `week_start`). When `week.late` is true and nobody said how the household shops, ask (as on the Late path).

Done when you have a `week_start` whose Week Menu note exists.

### 2. List the lines

Run `food basket lines --week <week_start>`. It prints JSON `lines`, one per ingredient line of every Recipe and Side the week buys:
- `line` (as written), `ingredient` (the name its Pinned Product is found by: without amount, preparation or remarks in brackets, and "tinned …" for a line bought in tins), `times` (dinners it is bought for: 2 on a Double cook day), `optional`;
- `pinned`: the Pinned Product from Products.md (`product` id or null, `title`, `pack`, `kind`), or null;
- `match`: for a pinned, non-optional line, its Match (from the Pinned Product) for `food basket fill`, ready to use. `packFraction: null` means the CLI couldn't compare the amount with the Pack: you work it out.

Also read `<vault>/Staples.md` (Staple products are candidates for matching, and a Staple's product merges with the recipe line into one Basket line), each bought Recipe's source (a Meal's `source` property, a Side's `Source:` line: an Allerhande URL there brings in its [Allerhande suggestions](#matching-order)), and the Week Menu note's `## Basket` section if there is one: its `Have at home:` line and product lines hold the earlier run's answers.

Done when you have the JSON, the Staples, the Allerhande sources and any earlier `## Basket`.

### 3. Match every line

Every line with `optional: false` gets one entry. Optional lines get none: the CLI never buys them and lists them.

- A line with a complete `match` (a number or no `packFraction` field): take it as it is.
- A `match` with `packFraction: null`: fill in the pack fraction.
- A line without `pinned`: choose its product by the [matching order](#matching-order), give it a kind and a pack fraction. It is a **new Match**.

An entry is `{ recipe, line, product, title, kind, packFraction }`, with `recipe` and `line` copied from the line:
- `product`: the webshop id, or null when nothing sensible turned up (the CLI adds it to Mijn lijst as a free-text note).
- `title`: the AH product's title as AH gives it. Always pass it: it is the only title the shopping-list fallbacks have when AH can't be read.
- `kind`: **Fresh** (always bought: vegetables, herbs, dairy, bread), **Cupboard Ingredient** (long-life; the household is asked whether it's at home: tins, dried legumes, rice, pasta, coconut milk, nuts, dried fruit, less common spices, sauces) or **Always in House** (never bought or asked about: salt, pepper, oils, vinegar, everyday spices, stock cubes, soy sauce, flour, sugar, water). An Always in House line needs no product or pack fraction.
- `packFraction`: the share of **one** pack the line needs as written, for one dinner (the CLI multiplies by `times`): "300g red split lentils" of a 400 g pack = 0.75; "1 large onion" of a 1 kg bag ≈ 0.15 (an onion is about 150 g). Use ordinary weights for pieces: garlic clove 5 g, carrot 100 g, potato 200 g, tomato 100 g, pepper 1 piece; tsp 5 ml, tbsp 15 ml; a bunch of herbs is one pack.

Judgement calls:
- "A or B" ("yellow or white onions", "ghee or grapeseed oil"): match A.
- An ingredient that is clearly an existing Pinned Product under another name ("yellow or white onions" and the pinned "onion"), or a Staple's product ("plain yoghurt" and the Greek yoghurt Staple): use that product; it is still a new match, so the adult confirms it and it gets pinned under this name too.
- A Match from a Pinned Product that plainly doesn't fit its line (a different form of the ingredient than the pin's product): list it under New matches as a correction for the adult to confirm.
- **Running low**: when an adult says an Always in House item is running low ("we're out of cumin"), buy it this run: give its line `kind: "Cupboard Ingredient"` with a product and pack fraction (search for one if its pin has none). Its pin stays Always in House.

Done when every non-optional line has an entry with a kind, and every entry with a product has a title and a pack fraction above 0.

### 4. Ask once

One message, before anything is written. Leave out a part that is empty; when every part is empty, say "Every line is pinned and nothing to ask: filling the Basket." and go to step 6.

1. **New matches**: each new match on one line: ingredient (Recipe) → AH title, pack price, estimated packs this week, the kind, and how you found it (Allerhande suggestion / bought before / cheapest per kg / nothing at AH, added as a note). Lines that share a product go on one line.
2. **Cupboard Ingredients this week**, pinned and new, those with a product: "Which of these are at home?" When the note already has a `## Basket` section (a run after an earlier one), ask only about Cupboard Ingredients it doesn't cover: leave out those in its product lines (`(id <id>)`) and those its `Have at home:` line names.
3. **Optional, not added**: each optional line with its Recipe; added only if the adult names it.

End with: "Reply with corrections, what's at home and anything Always in House that's running low, or 'ok'."

```
New matches (11), confirm or correct:
- tomatoes (Dahl) → AH Trostomaten 500 g, €2.29, ×2, Fresh (bought before)
- basmati rice (Vegetable Biryani) → AH Basmati rijst 1 kg, €2.79, ×1, Cupboard Ingredient (cheapest per kg)
- lime leaves (Dahl) → nothing at AH, a note in Mijn lijst, Fresh
- salt, garam masala, bay leaves (Dahl, Vegetable Biryani, Naan) → Always in House, not bought

Cupboard Ingredients this week: which are at home?
red split lentils, coconut milk, basmati rice, cashews

Optional, not added: Tacos: 8 tortilla wraps (optional)

Reply with corrections, what's at home and anything Always in House that's running low, or 'ok'.
```

Done when the adult has replied.

### 5. Apply the reply and pin

- Apply each correction to the entries: another product (search again with `food ah search`), another kind, another amount; and buy the Always in House items named as running low (step 3). A correction the adult calls one-off ("just this week") changes this run only.
- Write every confirmed new match, with its corrections, to a temp JSON file as a list of `{ ingredient, product, title, pack, kind }` and run `food products pin <file>`. `ingredient` is the line's `ingredient` exactly as listed ("yellow or white onions"), because that is what the next run looks up; `product` null for nothing at AH or Always in House; `pack` is the size as AH sells it, with its pieces when it holds several ("1 kg ≈ 7 onions", "6 stuks", "400 g"), so later runs can work out the pack fraction themselves. A correction to a Pinned Product goes in the same file: its pin replaces the row. Exit 1 lists the pins it refused; fix them and run it again.
- Collect the webshop ids of the Cupboard Ingredients at home, plus those an earlier `## Basket` section's `Have at home:` line names (look up their products in the entries). A Cupboard Ingredient without a product that is at home gets `kind: "Always in House"` for this run, so it isn't added as a note.

Done when Products.md holds every confirmed new match and you have the `haveAtHome` ids.

### 6. Fill the Basket

Write `{ "lines": [entries…], "haveAtHome": [ids…] }` to a temp JSON file. Tell the adult a browser window may open for the AH login, then run `food basket fill --week <week_start> <file>` with a long timeout (10 minutes): on an expired login the CLI opens the login itself, once. Run it once; a retry is the adult's call.

- **Exit 0**: Mijn lijst is filled (or the placed order already has everything). Show the report as printed.
- **Exit 2**: nothing was written to AH. Show the adult the whole output: it starts with the reason (order already placed, login failed, AH ordering down) and holds the add-multiple links, the shopping list, or what to change in Mijn bestellingen.
- **Exit 1** with "The matches don't fit the Week Menu": your list is off (a missing line, a line not on this week's Recipes, a product without pack fraction). Nothing was written; fix the entries and run it again.
- **Exit 1** otherwise: pass the message on.

A chosen Staple without an AH product id in `Staples.md` (Tea, the baby pouches) goes into Mijn lijst as a free-text note, "Tea (Staple ×1)", and is listed with the unmatched items. Nothing to do for it unless the adult wants it pinned: then add its product to `Staples.md` as a standing edit.

Done when the adult has seen the report or the CLI's whole output.

### 7. Report

After the CLI's output, add in a few lines: how many matches you pinned, any pack fraction or product you weren't sure of, and on the Late path how this week's food arrives instead of the Saturday slot.

## Matching order

Take the first source that gives a sensible product. Before searching, translate the ingredient to the Dutch word AH sells it under (the product as sold, without preparation: "red split lentils" → "rode linzen", "spring onion" → "lente-ui", "coriander" → "koriander").

1. **Pinned Product**: the line's `pinned`; its `match` is the entry (step 3).
2. **Allerhande suggestion**, only for a Recipe whose source is an Allerhande URL (`https://www.ah.nl/allerhande/recept/…`). Run `food ah suggestions <source>` once per such Recipe. It lists Allerhande's Dutch ingredient lines, each with AH's `product` (`id`, `title`, `size`, `price`) or null. The Recipe's lines are add-recipe's English translations of those lines: find the line's own ingredient among them and take its product when it is the ingredient itself. Work out the pack fraction from the line's amount and the product's `size` as for any product; `packs` (whole packs for the recipe as written) is only a cross-check. Exit 1 (AH not answering): go on with step 3.
3. **Previously bought**: `food ah bought "<Dutch>"`, most frequently bought first. Take the first result that is the ingredient itself (not a soup, mix or ready meal of it).
4. **Lowest unit price**: `food ah search "<Dutch>" --need <amount>`, with the week's total need (the line's amount × `times`, as 400g, 1.5l or a count) when it is in g, ml or pieces. Results come cleaned up (no sponsored, unorderable or multipack products, no pack that wastes more than about twice the need) and cheapest per kg, l or piece first, the AH house brand first on a tie. Take the first that is the ingredient itself.
5. **Nothing sensible**: `product: null`.

An Always in House ingredient skips the search. When `food ah bought` says to log in, tell the adult a browser window opens and run `food ah login` once; if that fails, go on with step 4 (search works without the login).
