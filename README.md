# Family food

The household's dinner planning, Albert Heijn Basket and Kitchen Display. See `GLOSSARY.md` for the vocabulary and `docs/adr/` for the main decisions.

## Layout

- `cli/`: the `food` CLI (TypeScript, run directly by Node ≥ 24)
- `display/`: the Kitchen Display page
- `bundle/`: the display bundle's shared type definition, used by both
- `ahdump/`: the AH client, a Go tool on appie-go that the CLI runs (see `ahdump/README.md`)
- `samples/`: a small sample Recipe Vault and the sample bundles built from it, used by the tests

## Setup

```sh
npm install
npm link                                  # puts `food` on your PATH
food config vault "<path to the Recipes vault>"
food preview                              # http://localhost:8787/
```

## Albert Heijn

```sh
npm run build:ahdump                      # needs Go
food ah login                             # once, in your browser
food ah search kikkererwten --need 400g   # cleaned up, cheapest per kg first
food ah bought melk                       # what the household bought before
```

The AH token is kept in the local config folder with mode 600, never in the Recipe Vault. The tests use a fake AH; `ahdump/README.md` lists the checks to do by hand against the live API.

## Local config

The local config lives in `~/Library/Application Support/family-food/` (`FOOD_CONFIG_DIR` overrides it). `FOOD_NOW` fixes the CLI's clock. The config's `fakes` key swaps an adapter for its fake, which keeps its state as JSON files in the folder given (`{ "fakes": { "ah": "/tmp/x/ah" } }`); the tests use this.

## Tests

```sh
npm test
npm run typecheck
```

The sample bundles in `samples/bundles/` are written by the CLI tests and read by the page tests. After an intended change to the bundle, update them with `npx vitest run -u`.
