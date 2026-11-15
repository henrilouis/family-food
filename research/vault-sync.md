# How the Mac, the iCloud vault and the Pi stay in sync

Research for [#4](https://github.com/henrilouis/food-automation/issues/4). Researched 15 Nov 2026.

## Answer

**Don't sync the vault to the Pi at all. The Mac is the only machine that writes to the Recipe Vault. The Pi holds a ready-made copy of the display and a log of taps that only ever grows.**

1. **Mac → Pi (display):** a job on the Mac builds the Kitchen Display pages (Week Menu + the recipes in it) from the vault. It then `rsync`s only that output to the Pi's web root over SSH. The Pi never gets the markdown, and never sees the rest of the vault.
2. **Pi → Mac (taps):** the Pi adds each "cooked" / 👍 / 👎 tap as one line to `events.jsonl`, with a unique id. The same Mac job pulls that file over SSH. It applies events it hasn't seen yet as small **frontmatter property edits** to the right recipe note, and records the applied ids in a ledger on the Mac (outside the vault).
3. **Writing into the note:** if Obsidian is running, the edit goes through Obsidian itself, using the Obsidian CLI `property:set` or `eval` with `app.fileManager.processFrontMatter`. That way the editor can't save over it. If Obsidian isn't running, the job edits the file directly: read it, change only the frontmatter, check that the file's hash hasn't changed, then do an atomic rename. iCloud then carries the change to the phone like any other edit.
4. **Schedule:** a launchd agent with `StartCalendarInterval` runs it, plus a run after each planning session. The Mac always starts the connection, and nothing listens on the Mac.

This avoids clobbering by design. There is one writer (the Mac), it edits only a few frontmatter keys rather than whole files, and the edits are idempotent, so replaying a log line is harmless. The Pi never holds an editable copy that could go stale.

## Local facts (checked read-only)

| Fact | Evidence |
|---|---|
| **Obsidian Sync is enabled as a plugin but not in use on this Mac.** | `.obsidian/core-plugins.json` has `"sync": true`. But Obsidian (1.15.1, running) had no open network sockets. Its Chromium network cache (`~/Library/Application Support/obsidian/Network Persistent State`) lists only `releases.obsidian.md`, GitHub and Teams. HSTS entries (`TransportSecurity`, host hashes decoded) show the same, with no `api.obsidian.md` or sync server. The Sync plugin keeps its connection state in IndexedDB `<vaultId>-sync` (from the app bundle `obsidian-1.15.1.asar`: `loadData(){… jh(this.app.appId+"-sync" …)`), so that state is not in the vault. A vault in iCloud is also exactly the setup Obsidian says not to combine with Sync. To be 100% sure, open Settings → Sync and see whether it asks you to log in or choose a remote vault. |
| The vault's `.git` isn't a sync channel. | `.git/config` has no remote and there are no branches. It does have `refs/copilot/checkpoints` and a worktree `henrilouis-legendary-pancake`, so a Copilot tool uses it as scratch space. Leave it alone. |
| The phone opens the same vault through iCloud. | `.obsidian/workspace-mobile.json` is updated alongside `workspace.json`. |
| The vault mixes recipes with **work notes** (a `Philips/` folder with 161 entries, interview notes, etc.). | Directory listing. The recipes are in `Recipes/{Meals,Baking,Sides or other,Meat,Week menus}`. Recipe notes currently have **no frontmatter** (e.g. `Recipes/Meals/Dahl.md`). |
| **The Mac is a company-managed work laptop.** | `profiles status`: enrolled via DEP, MDM `philips02.jamfcloud.com`. MacBook Pro, `pmset` sleep = 1 min. |
| iCloud "Optimize Mac Storage" is on. | `defaults read com.apple.bird optimize-storage` → `1`. No files in the vault are currently evicted (`find . -flags +dataless` finds nothing). |
| `/usr/bin/rsync` is **openrsync** (protocol 29), not GNU rsync. | `rsync --version`; `man rsync` → OPENRSYNC(1). |
| No Obsidian CLI registered (`obsidian` not on PATH). No Syncthing, Unison or fswatch installed. | `which` |

## Options compared

### A. Mac pushes the built display, Mac pulls the tap log (recommended)

- **Read path:** only the built output goes to the Pi. The Pi 3 just serves static files and accepts small POSTs, which fits easily in 1 GB. Work notes never leave the Mac.
- **Write-back:** the log only grows, each event has an id, and the Mac applies events as property edits. Clobbering can only happen if the same recipe's frontmatter is being edited on the phone during the few seconds iCloud takes to deliver the Mac's change. That's rare, and limited to a few keys.
- **Mac offline/asleep/away:** the display keeps the last pushed week, and taps queue on the Pi until the Mac is next home and awake. That's acceptable, because ratings aren't urgent and planning happens on the Mac anyway.
- **launchd caveat:** `StartInterval` jobs are *missed* while the machine sleeps. `StartCalendarInterval` jobs run on wake. `WatchPaths` is "highly discouraged… race-prone" (`man launchd.plist`, macOS 26.7). So use `StartCalendarInterval`.
- **To verify while building:**
  - Whether a launchd job (`/usr/bin/rsync`, or a script) can read `~/Library/Mobile Documents/…` without a privacy (TCC) prompt on this MDM-managed Mac.
  - That openrsync's options (`-a --delete`, `-e ssh`) are enough. They're listed in `man openrsync`.
- With Optimize Mac Storage on, reading a dataless file makes macOS download it first. Obsidian recommends **Keep Downloaded** on the Obsidian iCloud folder on macOS 15+ [O3].

### B. Pi calls an endpoint on the Mac

- The same single-writer property as A, but it reverses who starts the connection. The Mac would need a listening service and an inbound port open on a managed work laptop that sleeps after 1 min and leaves the house. The Pi would have to queue taps anyway for when the Mac is unreachable, so this turns into A with more parts.
- **Rejected.**

### C. Syncthing between the Mac (`Recipes/` inside iCloud) and the Pi

- Syncthing handles conflicts by renaming the older file to `<name>.sync-conflict-<date>-<time>-<device>.<ext>`, and that file then syncs like any normal file [S1]. In this vault, that means conflict files would show up in Obsidian and on the phone through iCloud.
- It also puts two sync engines (iCloud and Syncthing) on the same files, which Obsidian warns against for any combination of sync tools [O1][O2].
- When the Pi writes, it replaces the whole file, so a tap and a phone edit of the same note make a conflict copy instead of a merge.
- Syncthing's "Receive Only" folder type on the Pi [S2] would make the Pi a mirror. But then taps still need a separate channel, so it ends up as A with a heavier daemon.
- Obsidian notes that Syncthing "works best when at least one device is always on" [O3], and here neither the laptop nor the Pi reliably meets that for the vault side.
- **Rejected.**

### D. Git

- Line-based merges could in principle take a frontmatter change from the Pi alongside a body edit made in Obsidian. But a repo would have to cover the whole vault (work notes included), live inside iCloud next to iCloud's own syncing, and need the Mac to commit and pull on a schedule anyway. Merge conflicts would then need a human.
- The vault's existing `.git` has no remote and is used by Copilot checkpoints.
- **Rejected.**

### E. Obsidian Sync + Obsidian Headless on the Pi

- **This now exists officially.** Obsidian Headless (`npm i -g obsidian-headless`, `ob sync --continuous`) is an **open beta** command-line Sync client from Obsidian (npm package by Dynalist Inc., first published 2026-02-27, latest 0.0.14 on 2026-07-30). It needs Node ≥ 22 [O4][N1].
  - It has `--mode pull-only|mirror-remote`, `--excluded-folders` and `--conflict-strategy merge|conflict` [O4].
  - Markdown conflicts are merged with diff-match-patch, or written to a "Conflicted copy" file [O5].
  - The Pi 3's Cortex-A53 is 64-bit (Armv8) [R1], so a 64-bit OS can run Node 22. On Linux, prebuilt native binaries cover only Windows/macOS, and Sync works without them [O4].
- **Why not now:**
  1. Sync isn't connected for this vault, and it costs **$4/month billed yearly, or $5 monthly** [O6].
  2. Obsidian says not to use Sync alongside iCloud [O1][O2], so adopting it means moving the vault out of iCloud on the Mac *and* the phone. That's a big change to an everyday tool to serve one kitchen screen.
  3. Running Headless *on the Mac* to bridge iCloud to Sync is exactly the "two sync methods on the same files" setup Obsidian warns about. They also say not to run desktop Sync and Headless on the same device [O4].
  4. The whole vault, work notes included, would go to Obsidian's servers and the Pi unless each other folder is excluded. Folders created later would sync by default.
  5. It's a beta, and on the Pi it uses a lot of RAM (Node + better-sqlite3).
- **This is the upgrade path:** if the family ever moves off iCloud for other reasons, the Pi could become a normal Sync device in `bidirectional` mode, and the Mac-side relay could be removed.

### F. Reading iCloud directly on the Pi

- Apple has no iCloud client for Linux. Its system requirements list only Apple devices, Windows 11 (iCloud for Windows 15) and web browsers [A1].
- rclone's `iclouddrive` backend (v1.69+) can reach iCloud Drive. But it needs your regular Apple ID password + 2FA, its **trust token expires every 30 days**, and with ADP it also needs "Access iCloud Data on the Web" [C1].
- Unattended monthly re-authentication on a headless Pi is a non-starter.
- **Rejected.**

## Implications for other tickets

- **#7 (recipe properties):** write-back assumes cooked dates and ratings live in **frontmatter properties**, which are currently absent from all recipes. Pick names and types (e.g. `cooked: [dates]` list, `thumbs_up`/`thumbs_down` numbers, or a rating log) that `property:set` / `processFrontMatter` can update without touching the body.
- **#11 (how the parts run):** the Mac is an **MDM-managed work laptop that sleeps after 1 min**.
  - Everything should be started by the Mac and tolerate the Mac being away (laptop scheduled job, Pi as a standalone static server + tap queue).
  - It's worth confirming that personal launchd agents and SSH to a home device are allowed, and how long they'll keep working on this machine.
  - If the family wants the system independent of the work laptop, that's an argument for option E later.
- **#12 / #3 (display):** the Pi serves *built* pages, so the display format is decided on the Mac side. The Pi 3 only needs a static web server + one POST endpoint, which is light enough for 1 GB.

## Sources

- [O1] Obsidian Help, "Switch to Obsidian Sync": "We do not recommend using Obsidian Sync alongside cloud storage services (e.g. iCloud…)". https://github.com/obsidianmd/obsidian-help/blob/master/en/Obsidian%20Sync/Switch%20to%20Obsidian%20Sync.md
- [O2] Obsidian Help, Sync FAQ, "Can I use a third-party sync with Obsidian Sync?" https://github.com/obsidianmd/obsidian-help/blob/master/en/Obsidian%20Sync/Frequently%20asked%20questions.md
- [O3] Obsidian Help, "Sync your notes across devices": the iCloud section ("Keep Downloaded", Optimize Mac Storage), the Syncthing section, and "Avoid mixing sync services". https://github.com/obsidianmd/obsidian-help/blob/master/en/Getting%20started/Sync%20your%20notes%20across%20devices.md
- [O4] Obsidian Help, "Headless Sync" and "Obsidian Headless" (open beta, Node 22, sync modes, "Do not use both the desktop app Sync and Headless Sync on the same device"). https://github.com/obsidianmd/obsidian-help/blob/master/en/Obsidian%20Sync/Headless%20Sync.md · https://github.com/obsidianmd/obsidian-help/blob/master/en/Extending%20Obsidian/Obsidian%20Headless.md
- [O5] Obsidian Help, "Troubleshoot Obsidian Sync → Conflict resolution" (diff-match-patch for Markdown, "Create conflict file" option since 1.9.7). https://github.com/obsidianmd/obsidian-help/blob/master/en/Obsidian%20Sync/Troubleshoot%20Obsidian%20Sync.md
- [O6] Obsidian pricing page (Sync $4/user/month billed annually, $5 monthly). https://obsidian.md/pricing
- [O7] Obsidian Help, "Obsidian CLI": requires a running app and the 1.12.7+ installer; `property:set`/`property:read`, `eval`, `sync:status`. https://github.com/obsidianmd/obsidian-help/blob/master/en/Extending%20Obsidian/Obsidian%20CLI.md
- [N1] npm registry metadata for `obsidian-headless` (author Dynalist Inc., repo obsidianmd/obsidian-headless, versions/dates). https://registry.npmjs.org/obsidian-headless
- [S1] Syncthing docs, "Understanding Synchronization → Conflicting Changes". https://github.com/syncthing/docs/blob/main/users/syncing.rst
- [S2] Syncthing docs, "Folder Types" (Send Only / Receive Only). https://github.com/syncthing/docs/blob/main/users/foldertypes.rst
- [A1] Apple Support, "System requirements for iCloud" (no Linux). https://support.apple.com/en-us/118308
- [C1] rclone docs, "iCloud Drive and Photos" (30-day trust token, no app-specific passwords, ADP requirements). https://github.com/rclone/rclone/blob/master/docs/content/iclouddrive.md
- [R1] Raspberry Pi documentation, "BCM2837" (quad-core Cortex-A53, Armv8). https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/processors/bcm2837.adoc
- [L1] `man launchd.plist` on macOS 26.7.3 (`StartInterval` missed during sleep; `StartCalendarInterval` runs on wake; `WatchPaths` discouraged). `man rsync` (openrsync).
