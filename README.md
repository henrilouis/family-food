# Family food

The household's dinner planning, Albert Heijn Basket and Kitchen Display. See `GLOSSARY.md` for the vocabulary and `docs/adr/` for the main decisions.

## Layout

- `cli/`: the `food` CLI (TypeScript, run directly by Node ≥ 24)
- `display/`: the Kitchen Display page
- `bundle/`: the display bundle's shared type definition, used by both
- `ahdump/`: the AH client, a Go tool on appie-go that the CLI runs (see `ahdump/README.md`)
- `pi/`: the Kitchen Display Pi's setup script and Caddy config, run and uploaded by `food deploy`
- `samples/`: a small sample Recipe Vault and the sample bundles built from it, used by the tests
- `docs/meal-properties.md`: the Meal properties and the fixed `cuisine` and `base` lists, which `food vault check` reads

## Setup

```sh
npm install
npm link                                  # puts `food` on your PATH
food config vault "<path to the Recipes vault>"
food preview                              # http://localhost:8787/
food publish                              # after editing in Obsidian: send the Week Menus to the Kitchen Display
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

## Kitchen Display Pi

The Pi only serves static files with Caddy over plain HTTP on the LAN (ADR 0002). To set it up:

1. Flash Raspberry Pi OS Lite 64-bit with Raspberry Pi Imager presets: hostname `kitchen`, your SSH public key, Wi-Fi.
2. Give it a DHCP reservation on the router and add an SSH alias on the Mac, in `~/.ssh/config`:
   ```
   Host kitchen
     HostName <the reserved IP>
     User <the user from Imager>
   ```
3. Run `ssh kitchen true` once to accept its host key.
4. Run `food deploy` from a clean `main` that matches `origin`.

`food deploy` runs `pi/setup.sh` as root on the Pi (Caddy, key-only SSH, unattended security upgrades), then uploads the page to `/srv/kitchen/page/`. Run it again to update or repair the Pi; a run that has nothing to do says so. `food publish` uploads bundles into `/srv/kitchen/releases/` and switches the `current` symlink, which Caddy serves `*.json` from.

## Tests

```sh
npm test
npm run typecheck
```

The sample bundles in `samples/bundles/` are written by the CLI tests and read by the page tests. After an intended change to the bundle, update them with `npx vitest run -u`.

The browser tests (`display/test/*.browser.test.ts`) drive the page served by `food preview` in headless Google Chrome through `playwright-core`, so Chrome must be installed. They fix the page's clock with Playwright's clock.
