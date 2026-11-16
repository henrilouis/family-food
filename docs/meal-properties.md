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
