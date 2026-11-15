# How can an agent fill an Albert Heijn Basket?

Research for [issue #2](https://github.com/henrilouis/food-automation/issues/2). Researched 15 November 2026. Vocabulary follows `GLOSSARY.md` (Basket = the AH order before it is placed; an agent fills it, a human checks it out).

## Answer in brief

Albert Heijn has **no public API**. In practice there are three ways in, in this order:

1. **The unofficial mobile app API (`api.ah.nl`)**, logged in as the household's own account. It can search products (with pack size, price and Bonus), add products to the Basket, and read past orders and in-store receipts. This is what every active open-source project uses. Logging in is the fragile part. It broke twice in 2026 (June: bot protection; November: a new required header). After login, a refresh token keeps the session alive.
2. **AH's own "add-multiple" link** (`https://www.ah.nl/mijnlijst/add-multiple?p=<productId>:<qty>&…`). This is the link AH's recipe-site partners use for their buy buttons. No login or token is needed: the agent builds the link and a human clicks it once in a browser where they are logged in to ah.nl. Product IDs still come from the anonymous search API. About 25 products fit in one link.
3. **A grouped shopping list** (by aisle or category) that a human enters by hand.

**Recommendation:** for v1, use option 1 with a strict guard: never write when a delivery slot is booked or an order is open. Have the agent also produce the option 2 link as an automatic fallback. Fall back to option 3 for products that can't be matched, or when AH itself is down. Scripting ah.nl in a browser is **not** recommended because of Akamai bot protection (see §2.3).

## 1. The key fact: in the AH app, the Basket *is* "Mijn lijst"

AH's current app merges the shopping list and the online order into one basket:

> "In the Albert Heijn app, the shopping list and the online order share one basket. Before a delivery is booked, the basket is just your list. After you book a delivery or pick-up slot, everything in it becomes the order and is delivered and charged." ([albertheijn-mcp README](https://github.com/danieltyukov/albertheijn-mcp#how-ordering-works))

> "A real online order ('active order') only exists after the user picks a delivery/pickup slot in the AH app. … While an order is active, AH keeps no separate list: products added … go straight into the order (quantities are added), and free-text notes are rejected." ([fedorov-xyz/ah-mcp README, "Domain model: basket vs active order"](https://github.com/fedorov-xyz/ah-mcp#domain-model-basket-vs-active-order))

The appie-go maintainer confirmed that the REST "active order" and the GraphQL `basket` are the same object ([appie-go #10](https://github.com/gwillem/appie-go/issues/10)).

What this means for us:

- The **Basket** in our glossary maps to AH's "Mijn lijst" / `basket` while no slot is booked. Checkout = a human picks a slot and confirms.
- **Hazard:** if the family has a booked slot, including a Bezorgbundel "Vast Bezorg Moment" (a recurring slot, see [AH voorwaarden VII](https://web.archive.org/web/20261105093859/https://www.ah.nl/algemene-voorwaarden)), anything the agent adds goes **into an order that will be delivered and charged**. A careful client checks first and refuses to write. auto-heijn does three checks before writing: `basket.itemsInOrder`/`summary.deliveryDate`, `GET /mobile-services/order/v1/summaries/active`, and `orderFulfillments(status: OPEN)` ([auto-heijn server.py `booked()`](https://github.com/CalebSargeant/auto-heijn/blob/main/server.py)).
- The basket also accepts **free-text notes** (`originCode: "TXT"`) when no order is active ([appie-go API doc, "Shopping Lists"](https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md)). The agent can put unmatched ingredients there as text, so a human sees them at checkout.

## 2. Options in detail

### 2.1 Unofficial mobile API (`api.ah.nl`)

**Clients (all unofficial, all reverse-engineered from the iOS app):**

| Project | Lang / licence | Created → last push | Notes |
|---|---|---|---|
| [gwillem/appie-go](https://github.com/gwillem/appie-go) | Go lib + `appie` CLI, AGPL-3.0 | 2026-01-18 → 2026-11-08 | Reference client (87★). Its [API doc](https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md) is the best primary write-up. CLI: `appie login`, `appie search`, `appie order add`, `appie list add`, `appie receipt`. |
| [danieltyukov/albertheijn-mcp](https://github.com/danieltyukov/albertheijn-mcp) | TS MCP server | 2026-10-28 → 2026-11-13 | Preview-then-confirm for booked orders, past orders, receipts. Its [docs/api.md](https://github.com/danieltyukov/albertheijn-mcp/blob/main/docs/api.md) cross-checks several clients against live calls. Weekly live CI tests against AH. |
| [fedorov-xyz/ah-mcp](https://github.com/fedorov-xyz/ah-mcp) | Go MCP server (on appie-go) | 2026-10-01 → 2026-11-05 | Clear basket vs order model; no checkout or slot mutations by design. |
| [olekpuchka/albert-heijn-mcp](https://github.com/olekpuchka/albert-heijn-mcp), [Robert-SD/appie-mcp](https://github.com/Robert-SD/appie-mcp), [mrserzhan/ah-mcp](https://github.com/mrserzhan/ah-mcp) | TS / TS / Go | Mar–Nov 2026 | More MCP servers, same API. |
| [CalebSargeant/auto-heijn](https://github.com/CalebSargeant/auto-heijn) | Python | 2026-11-10 → 2026-11-12 | Closest to our use case: list → LLM product match → basket, human checks out, runs on a Mac. Refuses to write while an order is open. Read-only by default. |
| [HazlittM/ha_appie](https://github.com/HazlittM/ha_appie), [eejeha/Appie-Dashboard](https://github.com/eejeha/Appie-Dashboard), [KixAss/home-assistant-appie](https://github.com/KixAss/home-assistant-appie) | Home Assistant integrations | 2026 | Basket, orders, receipts. |

The pre-2026 Python generation (e.g. [SupermarktConnector](https://github.com/bartmachielsen/SupermarktConnector)) only covers anonymous product search.

**Authentication** ([appie-go `auth.go`/`login.go`](https://github.com/gwillem/appie-go/blob/main/login.go), [API doc](https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md#authentication)):

- *Anonymous:* `POST /mobile-auth/v1/auth/token/anonymous` with `{"clientId":"appie-ios"}`. Good enough for product search, product details, Bonus and delivery slots. I verified this live on 2026-11-15: `expires_in: 604798`, about 7 days.
- *User login:* OAuth authorization-code flow. The human logs in on `login.ah.nl/secure/oauth/authorize?client_id=appie-ios&response_type=code&redirect_uri=appie://login-exit`. AH redirects to `appie://login-exit?code=…`, a custom scheme that browsers can't open, so tools either proxy the login page locally or ask the human to copy the code from DevTools. The code is single-use and short-lived. It is exchanged at `POST /mobile-auth/v1/auth/token` for an access + refresh token.
- *Refresh:* `POST /mobile-auth/v1/auth/token/refresh`. **AH rotates the refresh token on every use.** Two processes refreshing at once will log you out, so only one writer may hold the token ([appie-go #26 comment](https://github.com/gwillem/appie-go/issues/26); [albert-heijn-mcp README](https://github.com/olekpuchka/albert-heijn-mcp): "AH replaces the login every time it's renewed, so an older copy … gets rejected").
- *Session length:* nobody has measured the logged-in access-token lifetime or the refresh-token lifetime ([albertheijn-mcp docs/api.md §Lifetimes](https://github.com/danieltyukov/albertheijn-mcp/blob/main/docs/api.md)). One integration reports "een token is 7 dagen geldig en wordt een dag van tevoren vernieuwd" ([Appie-Dashboard](https://github.com/eejeha/Appie-Dashboard)). All the integrations treat the session as long-lived and auto-renewing, and ask for a re-login when AH refuses the refresh. **Expect an occasional manual re-login; its frequency is unknown.**
- *Bot protection on login:* `login.ah.nl` sits behind Akamai and an invisible hCaptcha that only works on AH's own origin (it rejects `localhost`). It returns 403 to non-browser TLS fingerprints, and to curl's default UA ([appie-go #26](https://github.com/gwillem/appie-go/issues/26); [albertheijn-mcp docs/api.md](https://github.com/danieltyukov/albertheijn-mcp/blob/main/docs/api.md), live row 27). The **most robust path is the manual one**: the human logs in on the real AH page in a normal browser and pastes the `appie://login-exit?code=…` URL. auto-heijn, ha_appie, Appie-Dashboard and albert-heijn-mcp all document this. `api.ah.nl` itself did not block a plain client in my live test.

**Product search** (my live test on 2026-11-15, anonymous token, `query=kikkererwten`):

- `GET /mobile-services/product/search/v2?query=…&page=0&size=…&sortOn=RELEVANCE` returns `webshopId` (the product ID used everywhere), `title`, `brand`, `salesUnitSize` ("400 g", "3 stuks"), `priceBeforeBonus`, `currentPrice` (only set when on Bonus), `unitPriceDescription` ("prijs per kg €3.36"), `isBonus`, `bonusMechanism`, `isOrderable`, `isSponsored`, plus with a user token `isPreviouslyBought`. The request needs header `x-application: AHWEBSHOP`.
- **Sponsored products rank first.** For "kikkererwten" the top two results were sponsored Bonduelle tins at €7.51–11.46/kg. The house-brand AH Terra (€3.36/kg) came third. Matching logic must drop `isSponsored` results and compare unit prices; [slimmandje-recepten `ah-list.ts`](https://github.com/briembra/slimmandje-recepten/blob/master/lib/ah-list.ts) also drops multipacks and picks the smallest pack that covers the amount needed.
- With a user token, REST search supports `sortOn=PURCHASE_FREQUENCY | PURCHASE_DATE`, and GraphQL `productSearch(input:{previouslyBought:true})` lists previously bought products ([albertheijn-mcp docs/api.md §7.2](https://github.com/danieltyukov/albertheijn-mcp/blob/main/docs/api.md)). This is the strongest matching signal: prefer what the family already buys.
- GraphQL `SearchProducts` supports facets, including `product.properties.dieet` (diet) ([albertheijn-mcp docs/api.md](https://github.com/danieltyukov/albertheijn-mcp/blob/main/docs/api.md)). REST is the only endpoint that returns the `bonusMechanism` text ([appie-go API doc](https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md#search-products-rest)).

**Adding to the Basket:**

- GraphQL `mutation { basketItemsAdd(items: [{id: <webshopId>, quantity: n}]) { status errorMessage } }` adds quantities to the basket (it adds, it doesn't set) ([auto-heijn `add_items`](https://github.com/CalebSargeant/auto-heijn/blob/main/server.py)). `basketItemsUpdate` sets them ([appie-go #18](https://github.com/gwillem/appie-go/issues/18)).
- REST `PUT /mobile-services/order/v1/items` (appie-go `AddToOrder`) works on the active order. It **silently does nothing** for reopened, already-placed orders. The app itself uses only GraphQL there ([appie-go #18](https://github.com/gwillem/appie-go/issues/18), open since 2026-05-11). Use GraphQL.
- Read back with `query { basket { itemsInList { id quantity product { id } } itemsInOrder { id } summary { shoppingType deliveryDate } } }` to verify what landed.
- Checkout (`checkoutConfirmOrderV4`) and slot booking exist in the API ([appie-go #18](https://github.com/gwillem/appie-go/issues/18)). **Do not call them.** Checkout stays with a human, as the glossary requires.

**Rate limits:** AH sends no back-off headers. One MCP client caps itself at 4 concurrent requests and retries on 429 ([appie-go README](https://github.com/gwillem/appie-go#notes); [albertheijn-mcp docs/api.md](https://github.com/danieltyukov/albertheijn-mcp/blob/main/docs/api.md)). Heavy testing raised one user's IP risk score and triggered stricter blocking ([appie-go #26](https://github.com/gwillem/appie-go/issues/26)). Run from the home Mac (residential IP). auto-heijn warns that "AH's bot protection is stricter with datacenter addresses".

### 2.2 AH's add-multiple link (no login)

- Format: `https://www.ah.nl/mijnlijst/add-multiple?p=<webshopId>:<qty>&p=…`. AH's recipe-site partners (the FIU "koopknop" via the Partnerize affiliate programme) use it. Wayback has a partner link from 2026-09-17 and 200 snapshots through 2026-10-05 ([snapshot](https://web.archive.org/web/20260917182145/https://www.ah.nl/mijnlijst/add-multiple?p=378626:1&p=231409:1&p=579310:2&p=525848:1&p=4160:1&p=570443:1&p=197977:1&p=238971:1&utm_order=01a0b09a-5688-70d4-8b8f-5aedafd2e913&clickref=1100lDtT4oSh&utm_medium=affiliate&utm_source=fiu_leukerecepten&utm_content=0&utm_campaign=koopknop)). Open-source users: [smart-cart `cart-links.ts`](https://github.com/RonanCodes/smart-cart/blob/main/src/lib/cart-links.ts), [slimmandje-recepten](https://github.com/briembra/slimmandje-recepten/blob/master/lib/ah-list.ts).
- Products land in "Mijn lijst", which is the Basket (§1). The same booked-slot hazard applies.
- **Limit:** "reliably applies ~25 SKUs per request; larger sends silently truncate (~26 of 79 observed)", so send chunks of 25 ([smart-cart `cart-links.ts`](https://github.com/RonanCodes/smart-cart/blob/main/src/lib/cart-links.ts)). A weekly order of 40–60 lines needs 2–3 links.
- Pros: no credentials or token rotation. It still works when login breaks, and it is an AH-sanctioned public link, so there is no ToS question. Cons: a human must click (and be logged in to ah.nl); the agent can't confirm the result; it can't read history.
- *Not verified today.* My curl request got Akamai's 403 "Access Denied" (expected for non-browser clients). Test it once by hand in Safari/Chrome.

### 2.3 Scripting ah.nl in a browser (Playwright etc.)

Not researched in depth. ah.nl and login.ah.nl are behind Akamai Bot Manager with JA3/TLS fingerprinting and telemetry cookies (`_abck`), plus hCaptcha ([appie-go #26](https://github.com/gwillem/appie-go/issues/26)). A plain fetch of `https://www.ah.nl/algemene-voorwaarden` returned 403 in this research. Website DOM automation is more fragile than the app API, which every maintained project chose instead. **Not recommended.**

### 2.4 Fallback: grouped shopping list

Always possible. Use it for anything the agent can't match confidently. Use it for the whole week when AH is down: AH's online ordering was **completely unavailable from 11 to ~23 October 2026** after a cybersecurity incident at Albert Heijn, Etos and Gall & Gall. Website and app came back on 18 October; ordering came back step by step from 21 to 23 October ([AH mediastatement](https://nieuws.ah.nl/mediastatement-inzake-it-incident/), updates 4–14).

## 3. Can it read past orders and Bonus card history?

**Yes, with a user login.** This matters for Staples and for learning product preferences.

- **Online orders:** GraphQL `orderFulfillments(status: CLOSED, size: 25)` lists past orders. `orderFulfillment(orderId)` with `orderLines`, or REST `GET /mobile-services/order/v1/<orderId>/details-grouped-by-taxonomy`, returns the line items with `webshopId`, title, `salesUnitSize`, quantity and price, grouped by AH category ([appie-go #14](https://github.com/gwillem/appie-go/issues/14), [API doc "Get Order Details"](https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md#get-order-details-grouped-by-taxonomy)). Invoice PDFs are downloadable.
- **In-store purchases (Bonuskaart):** `GET /mobile-services/v1/receipts` and receipt details (now partly via GraphQL, [appie-go #5](https://github.com/gwillem/appie-go/issues/5)). These only cover visits where the Bonuskaart was scanned. Receipt product IDs are POS IDs. Convert them to `webshopId` with GraphQL `productConvertId(sourceId)` ([API doc "productConvertId"](https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md#productconvertid)).
- **Derived signals:** `isPreviouslyBought` on search results, `sortOn=PURCHASE_FREQUENCY`, the "previously bought" Bonus section, and personal Bonus Box offers ([API doc "Bonus / Promotions"](https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md#bonus--promotions)). ha_appie already derives "regular products" from items ordered in at least 4 of the last 8 deliveries ([ha_appie README](https://github.com/HazlittM/ha_appie)), which is effectively automatic Staple detection.

## 4. Reliability and breakage history (2026)

| When | What broke | Status |
|---|---|---|
| Jan–Feb | Receipts endpoint 503, then moved to GraphQL ([#1](https://github.com/gwillem/appie-go/issues/1), [#5](https://github.com/gwillem/appie-go/issues/5)) | Fixed in days |
| Feb | Login timeout in Safari (Secure cookies on localhost proxy) ([#7](https://github.com/gwillem/appie-go/issues/7)) | Fixed in v0.0.9 |
| May | REST add-to-order silently ignored for reopened orders ([#18](https://github.com/gwillem/appie-go/issues/18)) | Open; use GraphQL |
| Jun | Akamai WAF returns 403 to Go's TLS fingerprint on login; hCaptcha tied to AH origin ([#26](https://github.com/gwillem/appie-go/issues/26)) | Bypass in [PR #32](https://github.com/gwillem/appie-go/pull/32), **open/unmerged**; manual code paste still works |
| 11–23 Oct | AH cybersecurity incident: site, app and online ordering down ([AH](https://nieuws.ah.nl/mediastatement-inzake-it-incident/)) | Recovered |
| 6 Nov | Login ends on "Je bent al ingelogd" with no code; AH now requires `x-fraud-detection-installation-id` and returns the code inside `ingelogd.json` ([#34](https://github.com/gwillem/appie-go/issues/34)) | Fixed in fork [edeckers/appie-go@cef776a](https://github.com/edeckers/appie-go/commit/cef776a) (2026-11-08), **not merged** |

Pattern: **the data API (search, basket, orders) has been stable. Login is what breaks**, about twice a year, and fixes come from the community within days. A design that logs in rarely, keeps one refresh-token holder, and falls back to the add-multiple link when the session dies survives these breakages.

## 5. Terms of Service risk

From AH's terms (Wayback copy of [ah.nl/algemene-voorwaarden](https://web.archive.org/web/20261105093859/https://www.ah.nl/algemene-voorwaarden), captured 2026-11-05):

- **III.1 (AH app):** "U mag de AH app niet deassembleren, decompileren of onderwerpen aan reverse engineering." Using the app's private API is reverse engineering in spirit. We would use clients that others built rather than decompile anything ourselves, but that is a thin distinction.
- **II.14 / III.4 (IP):** copying or editing the site's or app's information without permission is not allowed, "behalve voor persoonlijk gebruik". A household agent is personal use.
- **II.10:** "Uw Account is uitsluitend voor eigen gebruik." Our agent acts for the account holder, which is fine; don't share tokens with third-party services.
- **II.43:** on (suspected) misuse or fraud AH may run extra checks and **block the account**.
- I found no explicit clause against bots, scraping or automation (search done 2026-11-15). Every unofficial project warns "may be against AH's terms" ([ha_appie](https://github.com/HazlittM/ha_appie)).

Assessment: the realistic worst case is that the integration stops working or the account is blocked. Legal action against one household reading and writing its own basket at low volume is unlikely. Keep traffic low (one session a week plus occasional searches), run from the home IP, never automate checkout, and don't bypass the captcha or WAF (log in by hand). The add-multiple link carries no ToS risk; the anonymous product search is the same unofficial API, but only reads public catalogue data.

## 6. Ranked recommendation

1. **Unofficial app API, guarded.** One small local service or MCP on the Mac holds the single refresh token. It gets an anonymous token for search and a user token for basket and history. Before writing it checks for an open order or booked slot and refuses if it finds one. It adds through GraphQL `basketItemsAdd`, puts unmatched ingredients in as free-text notes or on the fallback list, then reads the basket back and reports a diff. Login is a manual code paste from a normal browser, needed rarely. The surface we need is small (anonymous token, code exchange, refresh, REST search, `basket` query, `basketItemsAdd`, `orderFulfillments`, receipts). Wrapping appie-go (AGPL, most-used) or an existing MCP server is fine, but they are 1–2 person hobby projects that change weekly, so pin a version and keep a thin adapter.
2. **add-multiple link(s)**, built automatically from the same matched product IDs, in chunks of ≤25. Use them whenever option 1 can't write (session expired, login broken, write error). A human clicks 2–3 links before checking out.
3. **Grouped shopping list**, always produced alongside, for unmatched items and for outages.

**When to fall back to the list:** (a) AH online ordering is down (like October 2026); (b) the product match is uncertain; (c) both options 1 and 2 fail; (d) a slot is already booked and the human prefers not to edit that order.

## 7. Not verified

- The logged-in access-token and refresh-token lifetimes. Nobody has published measurements.
- Whether add-multiple works today, and whether it needs `wi`-prefixed or bare IDs. Partner links use bare IDs. My curl request was blocked by Akamai, as expected.
- Whether appie-go's `Login()` works today without the unmerged fork fix (#34 suggests it does not).
- How AH treats one account using the app API next to the real app. No reports of blocked accounts were found; that is not proof none exist.
- AH's terms page could not be fetched live (Akamai 403). The Wayback copy from 2026-11-05 was used.
- Web search was unavailable during this research. Sources were found through GitHub search and direct fetches.

## Sources

- AH terms: [Wayback 2026-11-05 of ah.nl/algemene-voorwaarden](https://web.archive.org/web/20261105093859/https://www.ah.nl/algemene-voorwaarden) (II.10, II.14, II.43, III.1, III.4, VII)
- AH incident: [nieuws.ah.nl mediastatement](https://nieuws.ah.nl/mediastatement-inzake-it-incident/)
- appie-go: [repo](https://github.com/gwillem/appie-go), [API doc](https://github.com/gwillem/appie-go/blob/main/doc/albertheijn_api.md), [login.go](https://github.com/gwillem/appie-go/blob/main/login.go), [order.go](https://github.com/gwillem/appie-go/blob/main/order.go), issues [#1](https://github.com/gwillem/appie-go/issues/1) [#5](https://github.com/gwillem/appie-go/issues/5) [#7](https://github.com/gwillem/appie-go/issues/7) [#10](https://github.com/gwillem/appie-go/issues/10) [#14](https://github.com/gwillem/appie-go/issues/14) [#18](https://github.com/gwillem/appie-go/issues/18) [#26](https://github.com/gwillem/appie-go/issues/26) [#34](https://github.com/gwillem/appie-go/issues/34), [PR #32](https://github.com/gwillem/appie-go/pull/32), [edeckers fix cef776a](https://github.com/edeckers/appie-go/commit/cef776a)
- [danieltyukov/albertheijn-mcp](https://github.com/danieltyukov/albertheijn-mcp) and [docs/api.md](https://github.com/danieltyukov/albertheijn-mcp/blob/main/docs/api.md)
- [fedorov-xyz/ah-mcp](https://github.com/fedorov-xyz/ah-mcp), [olekpuchka/albert-heijn-mcp](https://github.com/olekpuchka/albert-heijn-mcp), [Robert-SD/appie-mcp](https://github.com/Robert-SD/appie-mcp), [mrserzhan/ah-mcp](https://github.com/mrserzhan/ah-mcp)
- [CalebSargeant/auto-heijn](https://github.com/CalebSargeant/auto-heijn) ([server.py](https://github.com/CalebSargeant/auto-heijn/blob/main/server.py))
- [HazlittM/ha_appie](https://github.com/HazlittM/ha_appie), [eejeha/Appie-Dashboard](https://github.com/eejeha/Appie-Dashboard)
- add-multiple: [smart-cart cart-links.ts](https://github.com/RonanCodes/smart-cart/blob/main/src/lib/cart-links.ts), [slimmandje-recepten ah-list.ts](https://github.com/briembra/slimmandje-recepten/blob/master/lib/ah-list.ts), [Wayback partner link 2026-09-17](https://web.archive.org/web/20260917182145/https://www.ah.nl/mijnlijst/add-multiple?p=378626:1&p=231409:1&p=579310:2&p=525848:1&p=4160:1&p=570443:1&p=197977:1&p=238971:1&utm_order=01a0b09a-5688-70d4-8b8f-5aedafd2e913&clickref=1100lDtT4oSh&utm_medium=affiliate&utm_source=fiu_leukerecepten&utm_content=0&utm_campaign=koopknop)
- Live probes (2026-11-15, from this Mac): anonymous token (`expires_in 604798`), REST search `kikkererwten` (sponsored results first), `www.ah.nl` add-multiple and terms pages → Akamai 403 for curl.
