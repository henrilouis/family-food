# Meal properties

Every Meal in the Recipe Vault's `Meals` folder carries these properties. Sides and Baking have none. `food vault check` warns about any other property, a Meal with no `cuisine`, a `cuisine` or `base` value outside the lists below, and `serves` above 6.

| Property | Type | Meaning |
|---|---|---|
| `serves` | number | Portions as written (one dinner) |
| `active_minutes` | number | Hands-on time |
| `total_minutes` | number | Including oven, soaking, dough waits |
| `cuisine` | text | One value from the `cuisine` list |
| `base` | list | Values from the `base` list |
| `double` | checkbox | Reheats well and scales to two days |
| `source` | URL | Original recipe; the Allerhande URL drives product suggestions |
| `sides` | list of wikilinks | Optional pairings, first is the default |
| `novel` | checkbox | Set when saved at lock; cleared on 👍 |
| `reviewed` | checkbox | False until a human checked the values |

The two lists below are the fixed values the planner compares for variety. `food vault check` reads them from this file: keep one value per `- ` line under each heading.

The lists were finalised during the backfill of the real recipes (#26). The starting lists covered all 49 Meals, so they stayed as they were; every value is in use. When assigning values:

- `cuisine` is where the dish comes from, not its ingredients: Japanese, Korean and Chinese are East Asian; Thai and Indonesian are Southeast Asian; Ottolenghi-style dishes, falafel and shakshuka are Middle Eastern; Surinamese roti is Other.
- `base` is the filling part of the dish as written, including what the recipe says to serve it with (rice, naan, wraps). Use `legumes` when beans, chickpeas or lentils are the bulk of the dish, alongside any other base. Use `none` when the recipe has no starch and doesn't name one (curries without rice, salads, quiche, soup, pancakes). A base that comes only from a Side, such as Lime Rice, isn't counted.

## `cuisine` values

- Indian
- East Asian
- Southeast Asian
- Middle Eastern
- Italian
- Mexican
- Dutch/European
- Other

## `base` values

- rice
- pasta
- noodles
- bread/wrap
- potato
- gnocchi
- legumes
- none
