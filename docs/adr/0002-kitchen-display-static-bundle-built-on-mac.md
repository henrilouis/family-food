---
status: superseded by ADR-0003
---

# The Kitchen Display is a static bundle built on the Mac; the Pi runs no app

The Pi could hold the Recipe Vault's markdown and render the Kitchen Display itself, which would make the upgrade to Obsidian Sync (headless `ob sync` on the Pi) a drop-in. We build on the Mac instead. `food publish` checks the vault, parses the current and upcoming Week Menus with their Recipes into one JSON display bundle, and uploads it to the Pi. The Pi only serves static files with Caddy, and the page in Fully Kiosk Browser picks the day and doubles amounts itself. This puts format errors in front of the agent at publish time, while it can still fix them, rather than on a screen in the kitchen. It also keeps a 1 GB Pi 3 free of an app runtime that would have to be kept running.

## Consequences

- The display shows only what was last published. Hand edits made in Obsidian need a `food publish`, and the Week screen shows when the last publish happened.
- Moving to `ob sync` means running the same Node builder on the Pi. The bundle format and the page stay as they are.
- The bundle is the first read model of the future family food app. Changing it is an API change, not a private detail.
