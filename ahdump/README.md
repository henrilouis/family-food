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
| `history -out <folder>` | pulls closed online orders and in-store Bonuskaart receipts into a folder (raw JSON per order and receipt, plus `lines.jsonl`); re-runs skip what is already on disk |

Exit codes: 0 done, 1 failed, 3 not logged in or AH refused the login (`food ah login` again).

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
9. Only when **no order is placed** for the coming Saturday (the order-placed guard comes with #30): put one product in Mijn lijst by hand, then
   `echo '{"products":[{"id":<that product id>,"quantity":1},{"id":<another id>,"quantity":1}],"notes":[{"description":"test note family-food","quantity":1}]}' | ahdump/ahdump -auth ~/Library/Application\ Support/family-food/ah-token.json basket-add`.
   In the app, the first product's quantity went up by 1 (one line, not two), the second is added, the note shows as free text, and nothing else changed. Remove the test items by hand.
10. If any step fails with a 403 from `api.ah.nl`, AH may be rejecting the honest User-Agent: note it on the ticket rather than changing the User-Agent.
