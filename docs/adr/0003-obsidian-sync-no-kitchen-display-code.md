---
status: accepted
---

# The Recipe Vault syncs with Obsidian Sync; the Boox opens it in Obsidian, with no display code

Supersedes ADR 0002. The Kitchen Display Pi stopped working halfway through testing, and the Pi, its deploy and the custom page were most of the setup. The Recipe Vault moves from iCloud Drive to Obsidian Sync, and the Boox in the kitchen runs Obsidian on that vault like any other device: the cook opens the bookmarked Week Menu note, taps through to the Recipe and doubles amounts by hand on a Double cook day. There is no display code, no Pi and no kiosk. `food publish` remains, but it only checks the vault and rewrites the shared This week note. The code of the Pi version is kept at the git tag `pi-kitchen-display`, to bring back as an Obsidian plugin if the plain notes don't work in the kitchen.

## Considered Options

- **The existing page as files in the vault, opened by Fully Kiosk.** On Android 11 and later Fully can't read HTML from shared storage, and Obsidian can't sync into Fully's own folder.
- **An Obsidian plugin running the existing deck.** It works on mobile and keeps doubling and one step per screen, but it's code to maintain before we know the plain notes fall short.
- **Merging the Recipe Vault back into the Notes vault**, so that one Standard Sync plan covers both. Sync excludes folders only, so the Notes vault's work notes at its root would reach an unlocked kitchen tablet. The Notes vault stays on iCloud instead; on the Mac and the iPhone each vault chooses its own storage.

## Consequences

- Obsidian Sync runs only while the Obsidian app is open. The CLI warns when Obsidian isn't running on the Mac, since it would read a vault without the phone's edits, and its own writes wouldn't reach the other devices.
- The Mac has "Sync all other types" on, so the AH purchase history (JSON) is backed up with the vault. The iPhone and the Boox leave it off.
- The Recipe template keeps its italic scalable amounts and inline Method amounts, and the vault check still blocks Publish on errors: they serve the cook, the Basket and any later display.
- There is no display bundle to treat as an API. Its types are now the CLI's parsed model of Recipes and Week Menus.
