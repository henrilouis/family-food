# Novel Recipe candidates

Find the **3** candidates for this week's Novel Recipe (the number is in [SKILL.md](SKILL.md#rules-and-numbers)), check each one, rank them and show them side by side. Run this only when no Novel Recipe carries over or waits.

## 1. Name the week's gaps

From the proposed week (step 4 without its Sunday): cuisines not yet used by the cooked dinners; `base` values that keep the variety rules with Saturday's and Monday's bases; the season; Wishes that are Novel Recipe ideas; Household Preferences Less and Kids. A Novel-idea Wish is the first gap to fill.

Also run `food plan sites` once. It prints each site's **track record** as JSON, `[{site, kept, rejected, notCooked, meals}]`: the Novel Recipes from that site the household kept (👍), rejected (👎) or didn't cook, from every Week Menu, and how many Meals already have their `source` there. `site` is the URL's host without `www.`. A site missing from the list is new to the household.

## 2. Find recipes

Sources, all equal: no source gets priority, and the candidates are the recipes that best fill the gaps wherever they come from.

| Source | Sites |
|---|---|
| Allerhande (site `ah.nl`) | through AH's app API: `food ah recipes` |
| Dutch, open | jaimyskitchen.nl, francescakookt.nl, keukenliefde.nl (`/recepten/` pages), leukerecepten.nl, dagelijksekost.vrt.be |
| English, open | loveandlemons.com, cookieandkate.com, budgetbytes.com, bbcgoodfood.com, cookwithmanali.com, indianhealthyrecipes.com, themediterraneandish.com, thekitchn.com, thehappyfoodie.co.uk, rasamalaysia.com |

Search them with the gaps as search terms:
- Allerhande: `food ah recipes [<Dutch words>] [--season lente|zomer|herfst|winter] [--cuisine <keuken>]`, e.g. `food ah recipes linzen --season winter --cuisine indiaas` (cuisine values are Allerhande's own Dutch ones: italiaans, indiaas, midden-oosters, …). It finds only vegetarian main courses and prints JSON candidates with `url`, `title`, `servings`, `activeMinutes`, `totalMinutes`, `tags` and `rating`;
- the open sites: web search limited to them, e.g. `site:loveandlemons.com OR site:cookwithmanali.com winter lentil curry`, or a site's WordPress search, `https://<site>/wp-json/wp/v2/posts?search=<term>&_fields=link` (Keukenliefde: `/wp-json/wp/v2/keu_recipe`), or its RSS feed at `/feed/` for what's new.

NYT Cooking, Serious Eats and The Guardian are excluded: leave their results out. Keep the volume low: a handful of searches, and about ten recipe pages read per session.

Read each promising recipe, from any source, with `food recipe fetch <url>` (Allerhande ones too: it reads them through the app API). Exit 3 or empty `steps`: read the page with your own web-fetch tool. Exit 2: the site is excluded; drop it. Exit 1 on an Allerhande URL: AH isn't answering; go on with the open sites. Its `rating` is `{value, count}`, `value` out of 5 and `count` the number of ratings (null when the site doesn't say), or null for an unrated recipe; Allerhande's ratings come in the same shape. For a page you read yourself, take the rating and count the page shows, if any.

## 3. Check every candidate

A candidate stays only when all of these hold:
- **Vegetarian**: every ingredient checked by add-recipe's meat-and-fish list (`.agents/skills/add-recipe/SKILL.md`, step 2), whatever the site's diet labels say, Allerhande's vegetarian filter included. Meat or fish as a main part drops it; a minor animal ingredient add-recipe would swap (stock, fish sauce) is fine, and you mention the swap.
- Its URL is not in `rejectedSources`.
- It is new: no Meal has the same `source` URL or title.
- No Household Preferences Never item.
- A dinner's main dish for four or so, with its steps and ingredients readable.
- Its site is not a **rejected site** and the recipe is not **poorly rated**, by the thresholds in [SKILL.md](SKILL.md#rules-and-numbers).

When a skip removes the recipe that best fills a gap or a Novel-idea Wish, say so in the proposal, e.g. "Skipped *Miso Aubergine* (example.com: 0 kept, 2 rejected)" or "Skipped *Red Lentil Soup*: 2.9 of 5 from 140 ratings".

## 4. Rank

1. Fills a Novel-idea Wish.
2. Fills the most gaps: an unused cuisine first, then a base that keeps the variety rules.
3. In season.
4. Site track record, among candidates that fill the same gaps: first a site with `kept` > 0, then one with `meals` > 0, then any other; ties go to fewer `rejected`. The rating only skips (step 3): an unrated recipe ranks the same as a well-rated one.
5. Fits its day: a Sunday dish may take longer; one that meets the weekday budget (`active_minutes` ≤ 45) and reheats well can also be the Monday Double.

Take the top 3, preferring different sites and cuisines among them.

## 5. Show them

Side by side, one column per candidate: title (as add-recipe will name it), site and URL, rating ("4.9 of 5, 57 ratings", or "unrated"), the site's track record in a few words ("3 kept, 0 rejected, 2 Meals", or "new site"), cuisine and base (from the fixed lists in `docs/meal-properties.md`), active and total minutes (estimated when the site gives none), serves, the gap it fills, whether it can be the Monday Double, and any swap it needs.

Done when three candidates pass every check of step 3, or fewer with the reason (and what you searched).
