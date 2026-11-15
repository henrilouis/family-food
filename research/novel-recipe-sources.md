# Where can the agent find vegetarian Novel Recipes?

Research for [#5](https://github.com/henrilouis/food-automation/issues/5). Checked live on 2026-11-15 from a Dutch IP address, unless a claim is cited to another source.

## Answer

- **Main source: Allerhande, through the Albert Heijn app's GraphQL API, not the ah.nl website.** The website blocks every automated client we tried. The app API works with an anonymous token. It has a vegetarian filter (2,583 vegetarian main courses), returns servings, times and ingredients as separate fields, and **links each ingredient to an AH product with a price**.
- **Second source: a short allowlist of open recipe sites with good schema.org `Recipe` JSON-LD.** This gives variety and English-language cuisines. Dutch: Jaimy's Kitchen, Francesca Kookt, Keukenliefde, Leuke Recepten, Dagelijkse Kost. English: Love and Lemons, Cookie and Kate (both fully vegetarian), Budget Bytes, BBC Good Food, Cook with Manali, Indian Healthy Recipes, The Mediterranean Dish, The Kitchn, The Happy Foodie, Rasa Malaysia.
- **Don't fetch automatically: NYT Cooking, Serious Eats, The Guardian (Meera Sodha).** All three name `Claude-User` and other AI agent user agents in a `Disallow: /` rule in `robots.txt`. NYT also sits behind a paywall, and Serious Eats returns HTTP 402 to scripted clients. The family can still paste one of these into the Recipe Vault by hand.
- **How to read a page:** use a plain HTTP fetch with an honest user agent, then parse the JSON-LD `Recipe` block. If that fails, use the `recipe-scrapers` library or have the LLM read the page. Every sampled site except the ah.nl website returned JSON-LD. Never trust `suitableForDiet` alone. The agent must check the ingredient list itself.

## 1. Allerhande (Albert Heijn)

### The website is closed to automated clients

`https://www.ah.nl/allerhande/...` and even `https://www.ah.nl/robots.txt` return `403 Access Denied` (Akamai). We saw this with curl using a browser user agent, an honest user agent and `Googlebot`. We also saw it with the agent's `webfetch` tool. Headless Chrome with a normal user agent got an Akamai behavioural challenge page ("Powered and protected by Akamai") instead of the recipe. The Mealie project hit the same block in 2023 and closed the issue as "not planned". A commenter there traced it to TLS fingerprinting ([mealie#2888](https://github.com/mealie-recipes/mealie/issues/2888)). The recipe pages do contain schema.org JSON-LD once a real browser has rendered them, per the same thread. An unattended agent can't rely on that.

### The app API is open (unofficial)

The Appie mobile app talks to `https://api.ah.nl`. This API is **undocumented and unofficial**. Community projects keep notes on it: [danieltyukov/albertheijn-mcp `docs/api.md`](https://github.com/danieltyukov/albertheijn-mcp/blob/main/docs/api.md) (live-checked 2026-10-28) and the schema dump in [gwillem/appie-go `doc/graphql-schema-20260118.md`](https://github.com/gwillem/appie-go/blob/main/doc/graphql-schema-20260118.md). We confirmed the calls below ourselves on 2026-11-15:

1. **Anonymous token**: `POST https://api.ah.nl/mobile-auth/v1/auth/token/anonymous` with `{"clientId":"appie"}`. Returns 200 with `expires_in: 604798` (about 7 days). No account needed.
2. **Search**: `POST https://api.ah.nl/graphql` with `recipeSearchV2(searchText, start, size, recipeIds: [], filters: [{group, values}])`. With `speciale-wensen=vegetarisch` and `menugang=hoofdgerecht` it returned **2,583 recipes**. Filter groups returned with the results include `seizoen` (winter, herfst, …), `keuken` (italiaans, indiaas, midden-oosters, …), `kooktechniek`, `soort-gerecht` and `veel-gebruikt` (snel, budget, makkelijk, gezond). Introspection is disabled, so the query shapes come from the community docs. The older `recipeSearch(query:{…})` used by [markooms/openclaw-skill-albert-heijn](https://github.com/markooms/openclaw-skill-albert-heijn) now fails validation.
3. **Detail**: `recipe(id)` returns `title`, `href` (→ `https://www.ah.nl/allerhande/recept/R-R<id>/<slug>`), `cookTime`, `ovenTime`, `waitTime` (minutes, integers), `servings {number type isChangeable}`, `courses`, `cuisines`, `tags`, `rating`, `nutritions`, and `preparation.steps` as a list of strings. `ingredients[]` come split into `text` / `quantity` / `quantityUnit` / `name` / `servingsScale`. Example: recipe 1302900 serves 4, with "1.2 kg biologische witte kool" → quantity 1.2, unit kg.
4. **Ingredient → product**: `recipeProductSuggestionsV2(options:{recipeId})` returned an AH product for **12 of 12** ingredients of recipe 1302900. Each came with a webshop product ID, pack size, price and quantity. Example: "300 g biologische volkorenorzo" → product 595034 "AH Biologisch Orzo volkoren (500 g)", ×1, €1.89. The response also has `alternativeSections`, for example organic or cheapest alternatives.

The vegetarian tag looks trustworthy. Searching "zalm", "tonijn" and "gehakt" with the `vegetarisch` filter returned only plant-based versions ("plantaardige zalm", "vega gehakt"). Results also include advertorials, marked "(advertorial)" in the title, and baby recipes such as "… - 12+ maanden". The agent may want to filter these out or use them on purpose.

**Risks:** the API is private, has already changed shape once (`recipeSearch` → `recipeSearchV2`) and could break or be rate-limited at any time. AH's terms of use were not reviewed here.

## 2. Other recipe sites

Method: we fetched one vegetarian recipe page per site with curl, using the honest user agent `FamilyFoodBot/0.1 (+repo URL)`, and parsed every `application/ld+json` block for `@type: Recipe`. The script is reproduced in the appendix. We read `robots.txt` for groups that name AI user agents.

| Site | Lang | Fetch | JSON-LD Recipe | Yield | Times | Cuisine | `suitableForDiet` | robots.txt for agents | Notes |
|---|---|---|---|---|---|---|---|---|---|
| jaimyskitchen.nl | NL | 200 | full | `"4"` | total | `Italiaans` | – | blocks `ClaudeBot` (training) only | keywords include `Kids, Peuter, Kleuter` |
| francescakookt.nl | NL | 200 | full | `["4","4 personen"]` | total, cook | misused (`"Vegan"`) | – | no AI rules | WP REST search, RSS feed |
| keukenliefde.nl | NL | 200 | full on `/recepten/…` (old `/<slug>/` posts have none) | `"4"` | total, prep, cook | `Thais` | `VegetarianDiet` | no AI rules | recipes are WP post type `keu_recipe`; recipe sitemaps |
| leukerecepten.nl | NL | 200 | full | `["2","2 personen "]` | `PT0H37M` style | `""` | `VegetarianDiet` | no AI rules | |
| dagelijksekost.vrt.be | NL (BE) | 200 | full | `"4"` | total, prep, cook | `Italiaans` | – | no AI rules | **not a vegetarian site**: a pumpkin orzotto contained speck |
| jan-magazine.nl | NL | 200 | full | `"2"` | total, cook | – | – | blocks GPTBot, anthropic-ai, CCBot | one "recept van de week" only; sample had serrano ham. Low value |
| loveandlemons.com | EN | 200 | full | `["4","4 to 6"]` | total, prep, cook | `American` | – | no AI rules | fully vegetarian site; WP REST; RSS |
| cookieandkate.com | EN | 200 | full | `["4","4 servings"]` | total, prep, cook | `Mediterranean` | – | blocks training bots only | fully vegetarian site; US units, `&frac14;` entities |
| budgetbytes.com | EN | 200 | full | `["6","6 servings"]` | total, prep, cook | `American` | – | **explicitly allows `Claude-User`** | ingredient lines include prices `($1.72)`; US units |
| bbcgoodfood.com | EN-GB | 200 | full | `4` | total, prep, cook | `Indian` | `GlutenFreeDiet, VegetarianDiet` (one string) | `Content-signal: search=yes, ai-train=no` | metric units |
| cookwithmanali.com | EN | 200 | full | `["4"]` | total, prep, cook (missing on one sample) | `Indian` | `VegetarianDiet` on one of two samples | no AI rules | vegetarian Indian site; WP REST search; RSS feed was empty |
| indianhealthyrecipes.com | EN | 200 | full (`HowToSection` steps) | `["2","2 to 3"]` | total, prep, cook | `North Indian` | – | no AI rules | WP REST blocked by Sucuri |
| themediterraneandish.com | EN | 200 with honest user agent; **Cloudflare challenge with a spoofed Chrome user agent** | full | `["6","6 (up to)"]` | total, prep, cook | – | – | no AI rules | |
| thekitchn.com | EN | 200 | full | `6` | `PT3900S` (seconds) | `[]` | – | no AI rules | |
| thehappyfoodie.co.uk | EN-GB | 200 | **partial: no `recipeInstructions`** | `"Serves 4"` | total, prep, cook | – | – (keywords include `Vegetarian`) | no AI rules | steps only in the HTML |
| rasamalaysia.com | EN | 200 | full | `["4","4 people"]` | total, prep, cook | `Japanese Recipes` | – | no AI rules | mostly a meat site |
| thissavoryvegan.com | EN | **403 "Security Verification"** to curl; **200 via the agent's `webfetch` tool** | (JSON-LD not checked; the page rendered with full ingredients and steps) | 4 bowls | prep, cook, total | `American` | – | no AI rules | vegan; some recipes are "members only"; WP REST works |
| cooking.nytimes.com | EN | 200 | full, including `suitableForDiet: [VeganDiet, VegetarianDiet]` | `"4 servings"` | total | – | yes | **`Disallow: /` for `Claude-User`, `ClaudeBot`, `ChatGPT-User`** | `isAccessibleForFree: false` (subscription) |
| seriouseats.com | EN | **402** for every user agent with curl (People Inc. "contact contentlicensing@people.inc"); homepage loads via `webfetch` | n/a | | | | | **`Disallow: /` for `Claude-User`, `Claude-SearchBot`, `ClaudeBot`, …** | |
| theguardian.com (Meera Sodha) | EN-GB | 200 | full | `["Serves 4"]` | total, prep, cook | `Japanese` | `VegetarianDiet` | **`Disallow: /` for `Claude-User`, `Claude-SearchBot`, `ClaudeBot`**; `Content-Signal: search=yes,ai-train=no,use=reference` | |
| ottolenghi.co.uk | EN | 200 | not checked | | | | | no AI rules | a Shopify shop with recipe round-up posts. Ottolenghi's own recipes mostly appear in the Guardian and NYT, which are both blocked |

Not sampled, but `robots.txt` allows them and `recipe-scrapers` supports them: lekkerensimpel.com and uitpaulineskeuken.nl (both Dutch).

### What this means

- **robots.txt and agent user agents.** Anthropic says all three of its bots honour robots.txt, and that blocking `Claude-User` "prevents our system from retrieving your content in response to a user query" ([Anthropic crawler docs](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)). NYT Cooking, Serious Eats and the Guardian block that agent explicitly, so they stay out of the automated allowlist.
- **Don't fake a browser.** Curl with a Chrome user agent triggered Cloudflare challenges (403 "Just a moment…") on budgetbytes, cookieandkate and themediterraneandish. The same requests with an honest bot user agent returned 200. A user agent that doesn't match the TLS fingerprint is what gets flagged.
- **Vegetarian status needs a check by the agent.** Only BBC Good Food, NYT, the Guardian, Keukenliefde, Leuke Recepten and some Cook with Manali pages set `suitableForDiet`. Mixed-diet sites hide meat in otherwise vegetable dishes: speck in the Dagelijkse Kost pumpkin orzotto, serrano ham in the Jan courgette pasta. Fully vegetarian sites (Love and Lemons, Cookie and Kate, This Savory Vegan, Cook with Manali) and Allerhande's `vegetarisch` filter lower the risk.

## 3. Finding candidates

In order of usefulness:

1. **Allerhande `recipeSearchV2`** with filters such as `vegetarisch` + `hoofdgerecht` + the current `seizoen`, optionally a `keuken` or a `searchText`. Paginate with `start`/`size`. This is the only source where a structured search alone is enough.
2. **Web search limited to the allowlist**, for example `site:loveandlemons.com OR site:jaimyskitchen.nl winter stew`. This is the easiest way to turn "something new and seasonal" into candidate URLs. It needs no code per site.
3. **"What's new" feeds** for novelty:
   - WordPress RSS at `/feed/` (10 items on loveandlemons, cookieandkate, budgetbytes and francescakookt; 100 on keukenliefde).
   - WordPress REST search: `/wp-json/wp/v2/posts?search=<term>&_fields=link` works on keukenliefde, francescakookt, cookwithmanali, thissavoryvegan, rasamalaysia and loveandlemons. Keukenliefde recipes live in `/wp-json/wp/v2/keu_recipe`. The endpoint is blocked on indianhealthyrecipes.
   - XML sitemaps listed in `robots.txt`, for example keukenliefde `keu_recipe-sitemap*.xml` and dagelijksekost `/api/sitemaps/recipes/0/sitemap.xml`.
4. **The family's own vault**: domains already in the vault say what they like, and new recipes from those domains are low-risk picks.

## 4. Reading a recipe and filling its properties

Pipeline: fetch the page with an honest user agent (fall back to the agent's own web-fetch tool), then extract the JSON-LD `Recipe` (handle `@graph` wrappers and `@type` given as a list). If the JSON-LD has no steps (The Happy Foodie) or is missing, use [`recipe-scrapers`](https://github.com/hhursev/recipe-scrapers) or let the LLM read the HTML. `recipe-scrapers` v15.13.0 (2026-10-18) has site-specific scrapers for albertheijn, bbcgoodfood, budgetbytes, cookieandkate, dagelijksekost, indianhealthyrecipes, keukenliefdenl, lekkerensimpel, leukerecepten, loveandlemons, nytimes, seriouseats, theguardian, thehappyfoodie, thekitchn and uitpaulineskeukennl. For Allerhande, use the GraphQL detail call instead.

How the fields could fill recipe properties in the vault:

| Property | JSON-LD source | Allerhande API | Normalisation needed |
|---|---|---|---|
| source URL | page URL / `@id` | `https://www.ah.nl` + `href` | — |
| title | `name` | `title` | trim (Jaimy's names start with a space) |
| servings | `recipeYield` | `servings.number` | yield comes as a number, string, list or "Serves 4". Take the first integer |
| total time | `totalTime` (sometimes only `cookTime`) | `cookTime` + `ovenTime` + `waitTime` (minutes) | ISO 8601 in several forms: `PT45M`, `PT0H37M`, `PT3900S`, `PT120M` |
| ingredients | `recipeIngredient` (free-text lines) | `ingredients[]` already split into quantity, unit and name | English sites use cups, pounds and ounces. Decode HTML entities. Remove Budget Bytes prices |
| steps | `recipeInstructions` (`HowToStep` or `HowToSection` → `itemListElement`) | `preparation.steps` | flatten sections |
| cuisine | `recipeCuisine` | `cuisines` / `tags` with key `keuken` | free text, sometimes empty or wrong ("Vegan", "Japanese Recipes") |
| course | `recipeCategory` | `courses` | free text |
| diet | `suitableForDiet` (rare) | tag `speciale-wensen: vegetarisch` | the agent always checks ingredients |
| image | `image` | `images(renditions:[…])` | — |
| rating | `aggregateRating` | `rating` | — |
| language | `inLanguage` (rare) / domain | always nl | — |

Servings, times and ingredients come out structured enough for properties from every allowlisted site. Cuisine and course labels are unreliable and should be treated as hints.

## 5. Findings for other tickets

- **Allerhande links straight to AH products.** `recipeProductSuggestionsV2` maps every ingredient to a webshop product ID, quantity and price, without login. If the Novel Recipe comes from Allerhande, the Basket ticket gets the hardest step (ingredient → product) done for free. `servingsScale` per ingredient also helps when scaling for the household.
- **AH can import outside recipes.** The schema has `MemberRecipe` ("created by members or scraped by members from third party sources"), `scrapeRecipe(url)` and `memberRecipeProductSuggestions`. That could give product mapping for Novel Recipes from any site, and maybe for vault recipes too. `scrapeRecipe` failed with an anonymous token ("Subgraph errors redacted"). It probably needs a logged-in member. **Not verified.**
- **AH has a week planner** (`recipeWeekPlannerOverview`, `recipeUpdateWeekPlannerItems`) that overlaps with the Week Menu idea.
- **Kid-friendliness signals exist in the data:** Jaimy's Kitchen keywords (`Kids, Peuter, Kleuter`) and Allerhande baby/toddler recipes ("12+ maanden"). These are useful if "kid-friendly" becomes a recipe property.
- **English sources bring US units.** Converting cups, pounds and ounces to grams matters for the Basket.

## Appendix: check script

```python
# usage: python3 ldcheck.py URL... (fetches with curl, honest UA; prints Recipe JSON-LD fields)
import sys, json, subprocess
from bs4 import BeautifulSoup
UA = "FamilyFoodBot/0.1 (+https://github.com/henrilouis/food-automation)"
def walk(o):
    if isinstance(o, list):
        for x in o: yield from walk(x)
    elif isinstance(o, dict):
        yield o
        if "@graph" in o: yield from walk(o["@graph"])
for url in sys.argv[1:]:
    html = subprocess.run(["curl", "-sL", "--compressed", "-A", UA, url], capture_output=True).stdout.decode("utf-8", "replace")
    for s in BeautifulSoup(html, "html.parser").find_all("script", type="application/ld+json"):
        try: d = json.loads(s.string or "")
        except Exception: continue
        for o in walk(d):
            t = o.get("@type"); t = t if isinstance(t, list) else [t]
            if "Recipe" in t:
                print(url, {k: o.get(k) for k in ["name", "recipeYield", "totalTime", "prepTime", "cookTime",
                                                  "recipeCuisine", "recipeCategory", "suitableForDiet"]},
                      len(o.get("recipeIngredient") or []), "ingredients")
```
