---
status: accepted
---

# The `food` CLI removes from Mijn lijst

Supersedes user story 63 of the v1 spec (#16): "the agent never removes anything from Mijn lijst, so that it can't destroy what I added by hand". In practice a change of mind on a recipe before ordering left the adult removing its products from the AH app by hand, from a list the CLI had already worked out.

- `food basket fill`, run again after the Locked Week Menu changed, takes out of Mijn lijst what an earlier run added (its `## Basket` section) that is no longer needed. It never takes more than the earlier run added, nor more than is still in Mijn lijst, so products added by hand on top stay.
- `food basket remove --product <id>[:<packs>] --note <text>` takes out anything the adult picks, whatever added it.
- Both write nothing while an order is open for changes in the AH app: whether AH's removals reach that order is unchecked, so the CLI lists what to remove there instead, as it does for a placed order. It still never checks out.

AH's GraphQL `basketItemsUpdate` (sets a product's quantity) and `basketItemsDelete` (`{id}` for a product, `{description}` for a free-text note) were checked live on 2026-11-28 through `ahdump basket-remove`.

## Considered Options

- **Keep listing removals for the adult.** Safe, but it is the chore that prompted this.
- **Remove only after confirmation in the fill-basket skill.** The `## Basket` section already records exactly what the CLI added, so removals within it are automatic; anything outside it goes through `food basket remove`, which the adult asks for.
