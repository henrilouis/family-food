# Family food

The household's dinner planning, Albert Heijn Basket and Kitchen Display. See `GLOSSARY.md` for the vocabulary and `docs/adr/` for the main decisions.

## Layout

- `cli/`: the `food` CLI (TypeScript, run directly by Node ≥ 24)
- `display/`: the Kitchen Display page
- `bundle/`: the display bundle's shared type definition, used by both
- `samples/`: a small sample Recipe Vault and the sample bundles built from it, used by the tests

## Setup

```sh
npm install
npm link                                  # puts `food` on your PATH
food config vault "<path to the Recipes vault>"
food preview                              # http://localhost:8787/
```

The local config lives in `~/Library/Application Support/family-food/` (`FOOD_CONFIG_DIR` overrides it). `FOOD_NOW` fixes the CLI's clock.

## Tests

```sh
npm test
npm run typecheck
```

The sample bundles in `samples/bundles/` are written by the CLI tests and read by the page tests. After an intended change to the bundle, update them with `npx vitest run -u`.
