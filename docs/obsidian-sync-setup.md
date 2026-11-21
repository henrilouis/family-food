# Moving the Recipe Vault to Obsidian Sync, and the Boox

The Recipes vault moves from iCloud Drive to Obsidian Sync, which carries it between the Mac, your iPhone and the Boox in the kitchen (ADR 0003). The Notes vault stays on iCloud as it is. Obsidian Sync only syncs while the Obsidian app is open on a device, and Obsidian advises against syncing one vault with both Sync and iCloud.

## 1. The Mac

1. Buy Obsidian Sync **Standard** (one remote vault) and log in to your Obsidian account in Obsidian's settings.
2. Close the Recipes vault in Obsidian (vault switcher → Manage vaults → remove Recipes from the list; this only forgets it).
3. Move the folder out of iCloud. Not into `~/Documents`, which a managed Mac may sync to iCloud too:
   ```sh
   mkdir -p ~/Obsidian
   mv ~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/Recipes ~/Obsidian/Recipes
   ```
4. In Obsidian: Open folder as vault → `~/Obsidian/Recipes`. Settings → Sync → Remote vault → Create, name it `Recipes`, set an encryption password (keep it with the household's passwords), then Connect.
5. Settings → Sync → **Sync all other types** on, so the AH purchase history (`.json`, `.jsonl`) is backed up with the notes. Turn on **Installed community plugin list** and **Active community plugin list** too, should a plugin ever be needed on the Boox.
6. Wait until the Sync status shows it's done, then point the CLI at the new folder:
   ```sh
   food config vault ~/Obsidian/Recipes
   food vault check
   food publish
   ```

From now on, keep Obsidian open on the Mac while the agent plans, adds recipes or fills the Basket. `food plan context`, `food basket lines` and `food publish` warn when it isn't running.

## 2. The iPhone

1. In Obsidian, open the vault switcher. If Recipes is still listed from iCloud, remove it from the list first, so you never edit the old copy.
2. Create new vault → name `Recipes`, **Store in iCloud off** → Create. Settings → Sync → log in, choose the remote vault `Recipes`, enter the encryption password, Connect.
3. Leave "Sync all other types" off. The Notes vault stays in iCloud Drive/Obsidian, unchanged; switch between the two with the vault switcher.
4. Check in the Files app that `iCloud Drive/Obsidian/` no longer holds Recipes.

## 3. The Boox

1. Install Obsidian from Google Play. Create a vault `Recipes` on the device, then Settings → Sync → log in, choose the remote vault `Recipes`, enter the encryption password, Connect. Leave "Sync all other types" off.
2. Bookmark the current Week Menu note (Week menus → `Week YYYY-MM-DD`), so cooking starts from it: tap tonight's dinner to open the Recipe.
3. BOOX per-app settings for Obsidian (long-press its icon): EinkWise **HD** mode; App Optimization → Others → Custom side buttons: **Scrolling** (or try Page turning).
4. Front light off. Normal sleep is fine: Obsidian syncs once it's open again; give it a few seconds after waking.

On a Double cook day, double the italic amounts yourself; the Week Menu's Note column says "Double: cook".

## 4. Check it

- [ ] `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Recipes` is gone, and `food config` shows `~/Obsidian/Recipes`.
- [ ] An edit on the iPhone reaches the Mac and the Boox with Obsidian open on them, and the other way round.
- [ ] The Mac's Sync version history lists a file from `AH purchase history/receipts/`.
- [ ] The Notes vault is unchanged and not on Obsidian Sync.
- [ ] With Obsidian closed on the Mac, `food plan context` prints the warning on stderr.
- [ ] After a week of cooking from the Boox, note on issue #24 what was missing (doubling, text size, paging), to decide whether display code should come back as an Obsidian plugin.
