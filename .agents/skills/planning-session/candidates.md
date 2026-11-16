# Novel Recipe candidates

Find the **3** candidates for this week's Novel Recipe (the number is in [SKILL.md](SKILL.md#rules-and-numbers)), check each one, rank them and show them side by side. Run this only when no Novel Recipe carries over or waits.

## 1. Name the week's gaps

From the proposed week (step 4 without its Sunday): cuisines not yet used by the cooked dinners; `base` values that keep the variety rules with Saturday's and Monday's bases; the season; Wishes that are Novel Recipe ideas; Household Preferences Less and Kids. A Novel-idea Wish is the first gap to fill.

## 2. Find recipes

Sources, all equal:

| Language | Sites (open, with schema.org Recipe data) |
|---|---|
| Dutch | jaimyskitchen.nl, francescakookt.nl, keukenliefde.nl (`/recepten/` pages), leukerecepten.nl, dagelijksekost.vrt.be |
| English | loveandlemons.com, cookieandkate.com, budgetbytes.com, bbcgoodfood.com, cookwithmanali.com, indianhealthyrecipes.com, themediterraneandish.com, thekitchn.com, thehappyfoodie.co.uk, rasamalaysia.com |

Search them with the gaps as search terms:
- web search limited to these sites, e.g. `site:loveandlemons.com OR site:cookwithmanali.com winter lentil curry`;
- a site's WordPress search, `https://<site>/wp-json/wp/v2/posts?search=<term>&_fields=link` (Keukenliefde: `/wp-json/wp/v2/keu_recipe`), or its RSS feed at `/feed/` for what's new.

NYT Cooking, Serious Eats and The Guardian are excluded: leave their results out. Allerhande (ah.nl) can't be read yet. Keep the volume low: a handful of searches, and about ten recipe pages read per session.

Read each promising recipe with `food recipe fetch <url>`. Exit 3 or empty `steps`: read the page with your own web-fetch tool. Exit 2: the site is excluded; drop it.

## 3. Check every candidate

A candidate stays only when all of these hold:
- **Vegetarian**: every ingredient checked by add-recipe's meat-and-fish list (`.agents/skills/add-recipe/SKILL.md`, step 2), whatever the site's diet labels say. Meat or fish as a main part drops it; a minor animal ingredient add-recipe would swap (stock, fish sauce) is fine, and you mention the swap.
- Its URL is not in `rejectedSources`.
- It is new: no Meal has the same `source` URL or title.
- No Household Preferences Never item.
- A dinner's main dish for four or so, with its steps and ingredients readable.

## 4. Rank

1. Fills a Novel-idea Wish.
2. Fills the most gaps: an unused cuisine first, then a base that keeps the variety rules.
3. In season.
4. Fits its day: a Sunday dish may take longer; one that meets the weekday budget (`active_minutes` ≤ 45) and reheats well can also be the Monday Double.

Take the top 3, preferring different sites and cuisines among them.

## 5. Show them

Side by side, one column per candidate: title (as add-recipe will name it), site and URL, cuisine and base (from the fixed lists in `docs/meal-properties.md`), active and total minutes (estimated when the site gives none), serves, the gap it fills, whether it can be the Monday Double, and any swap it needs.

Done when three candidates pass every check of step 3, or fewer with the reason (and what you searched).
