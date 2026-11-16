# Recipe Vault stays markdown; the partner takes part through shared Apple Notes

The partner keeps recipes in Apple Notes and the family once shared a Notes recipe list, so moving the Recipe Vault to Notes looks like the obvious choice. We keep the Recipe Vault as markdown in its own Obsidian vault in iCloud instead. The partner takes part only through a shared Notes folder, "Family food". It holds three notes: Food wishes (the one home of Wishes), This week (written by the agent) and Recipes to add (brought into the vault by `add-recipe`).

Notes would cost too much:

- Agents could only reach it through AppleScript on a Mac.
- Every write rewrites the whole note, losing checklists and attachments.
- Notes has no per-note properties, which the planner relies on.
- The Pi could only read it through Apple's private iCloud service, which can break without warning.

Sharing the Obsidian vault with the partner was also ruled out. Obsidian Sync needs a paid plan for each collaborator, and iCloud folder sharing doesn't work for vaults opened in Obsidian on iPhone.

## Consequences

- Agents run on a Mac, since only a Mac can read and write the shared Apple Notes.
- It is unconfirmed whether AppleScript can write to a note shared by another Apple ID. If it can't, the agent only reads Food wishes and Recipes to add, lists what to delete by hand, and drops This week.
- Wishes don't live in the vault, so the planner has two inputs: the vault and the Food wishes note.
