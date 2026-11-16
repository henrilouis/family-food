# ahdump

The `food` CLI's way into Albert Heijn's unofficial app API. A small Go tool on [appie-go](https://github.com/gwillem/appie-go), pinned to edeckers' fork at [`cef776a`](https://github.com/edeckers/appie-go/commit/cef776a) because that commit fixes the 6 November 2026 login change ([gwillem/appie-go#34](https://github.com/gwillem/appie-go/issues/34)) and is not merged upstream (see `go.mod`). It started as the throwaway purchase-history pull on `task/ah-purchase-history` (#6).

The CLI runs it through the AH gateway (`cli/adapters/ah/`); you rarely need to call it yourself.

```sh
npm run build:ahdump          # needs Go; writes ahdump/ahdump (git-ignored)
```

## Commands

Every command takes `-auth <token file>`; the CLI passes `~/Library/Application Support/family-food/ah-token.json` (`FOOD_CONFIG_DIR` overrides the folder).

| Command | What it does |
|---|---|
| `login` | appie-go's local-proxy login: opens AH's real login page in your browser through a proxy on `127.0.0.1` and writes the token file (mode 600) |
| `refresh` | renews the login now; AH hands out a new refresh token every time |
| `search [-token anonymous\|user] [-sort RELEVANCE\|PURCHASE_FREQUENCY] -- <query>` | prints AH's REST search results (`/mobile-services/product/search/v2`) as JSON, unchanged; the gateway cleans them up |
| `basket` | prints Mijn lijst (GraphQL `basket`: `itemsInList` with product id, title and price, and `notes`) as JSON, unchanged |
| `basket-add` | reads `{"products": [{"id", "quantity"}], "notes": [{"description", "quantity"}]}` on stdin; adds the products with GraphQL `basketItemsAdd` (it adds to the quantity already there) and the free-text notes with the shopping list's v2 `PATCH`, then prints Mijn lijst. Refuses quantities below 1 |
| `orders` | prints the open orders (GraphQL `orderFulfillments(status: OPEN)`: checked out or reopened, with `delivery.status` and `delivery.slot.date`) as JSON, unchanged; the CLI's order-placed guard looks for one on the Week Menu's Saturday |
| `history -out <folder>` | pulls closed online orders and in-store Bonuskaart receipts into a folder (raw JSON per order and receipt, plus `lines.jsonl`); re-runs skip what is already on disk |

Exit codes: 0 done, 1 failed, 3 not logged in or AH refused the login (`food ah login` again), 4 AH didn't answer or answered with a server error (5xx): its ordering may be down, and `food basket fill` falls back to a shopping list.

## How it treats AH

- One `ahdump` at a time (a lock file next to the token): AH rotates the refresh token on every renewal, so two processes renewing at once would log the household out.
- At least 1 s between requests, also across runs, and an honest User-Agent (`family-food-ahdump/0.1 (personal household use; …)`).
- An anonymous token (about 7 days) is kept next to the user token and reused for anonymous searches.
- It only adds to Mijn lijst: it never removes anything and never checks out. Run it from home (residential IP) and keep the volume low.

## Checking it by hand against the live API

The tests only cover the CLI against the fake AH. After a change here, or when AH changes its login, check the real thing from home on the Mac:

1. `npm run build:ahdump`
2. Anonymous search, before logging in: `FOOD_CONFIG_DIR="$(mktemp -d)" food ah search kikkererwten --need 400g`. Expect JSON with no sponsored products, the cheapest per kg first, the AH house brand first on a tie, and `previouslyBought: false` everywhere. Compare a few prices with the AH app.
3. `food ah login`. The AH login page opens in your browser; log in. The terminal prints `Logged in to AH.`
4. `ls -l ~/Library/Application\ Support/family-food/ah-token.json` shows `-rw-------`.
5. `food ah search griekse yoghurt`. Products you buy show `previouslyBought: true`.
6. `food ah bought melk`. Lists milk you have bought before, the one you buy most first.
7. `food ah refresh` prints `AH login renewed.`, the token file's `refresh_token` has changed and it is still `-rw-------`.
8. `food ah basket`. Compare with Mijn lijst in the AH app: the same products, quantities and prices, and your free-text notes.
9. Only when **no order is placed** for the coming Saturday (`ahdump/ahdump -auth … orders` shows none for that date): put one product in Mijn lijst by hand, then
   `echo '{"products":[{"id":<that product id>,"quantity":1},{"id":<another id>,"quantity":1}],"notes":[{"description":"test note family-food","quantity":1}]}' | ahdump/ahdump -auth ~/Library/Application\ Support/family-food/ah-token.json basket-add`.
   In the app, the first product's quantity went up by 1 (one line, not two), the second is added, the note shows as free text, and nothing else changed. Remove the test items by hand.
10. Order status, with **no order placed**: `ahdump/ahdump -auth ~/Library/Application\ Support/family-food/ah-token.json orders` prints `[]` (or only orders for other dates).
11. Order status, **after checking out** a real order for a Saturday (do this in a week you order anyway): the same command lists it with `delivery.slot.date` equal to that Saturday as `YYYY-MM-DD` and a `delivery.status` such as `SUBMITTED`. Then reopen it for changes in the app and run it again: it is still listed (e.g. `REOPENED`). If the date has another format, or the order is missing, note it on #30: the guard in `placedOrder` (`cli/adapters/ah/gateway.ts`) compares `delivery.slot.date` with the Week Menu's `week_start`. Also note whether a reserved Bezorgbundel slot without a checked-out order shows up here (it shouldn't).
12. With that order placed, `food basket fill --week <that Saturday> <matches.json>` exits 2, prints `The order for … is already placed` and the links or the add-and-remove list, and `food ah basket` / the app show nothing new.
13. Add-multiple links: open one link that `food basket fill` printed (or build one: `https://www.ah.nl/mijnlijst/add-multiple?p=<id>:2&p=<id>:1`) in a browser logged in to ah.nl, **with no order placed**. The products land in Mijn lijst with those quantities (bare webshop ids, no `wi` prefix). Try one with 25 products and check all 25 arrive. Remove the test items by hand.
14. Login expired: move `ah-token.json` out of the config folder and run `food basket fill …` (no order placed). It prints `AH login expired: log in again in the browser window that opens.` and opens the AH login once; log in and it fills Mijn lijst as usual. Delete the moved copy afterwards (AH rotated the refresh token, so it is useless). The path where AH still refuses after that login is covered by the fake only.
15. AH down can't be caused by hand; when AH's ordering is down (or with the Mac offline: Wi-Fi off), `food ah basket` fails with `AH is not answering…` (ahdump exit 4), not with a login error.
16. If any step fails with a 403 from `api.ah.nl`, AH may be rejecting the honest User-Agent: note it on the ticket rather than changing the User-Agent.
