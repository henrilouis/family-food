import { AppleNotesError } from "./adapters/apple-notes/notes.ts";
import { obsidianWarning } from "./adapters/obsidian.ts";
import { checkVault, formatCheck } from "./check.ts";
import { readConfig } from "./config.ts";
import { readPublished } from "./published.ts";
import { writeThisWeek } from "./this-week.ts";

/**
 * Publishes the current and upcoming Week Menus: checks what will be sent, then rewrites the shared This week note.
 * Returns false when the vault check found errors; nothing was sent and This week keeps its last content.
 * A This week note that Notes won't take is only a warning.
 */
export async function publish(vault: string, now: Date, log: (line: string) => void): Promise<boolean> {
  const config = await readConfig();
  const warning = await obsidianWarning(config);
  if (warning) log(warning);
  const check = await checkVault(vault, { publishing: now });
  if (check.errors.length + check.warnings.length > 0) log(formatCheck(check).trimEnd());
  if (check.errors.length > 0) {
    log("Not published: fix the errors above. The This week note keeps its last content.");
    return false;
  }

  try {
    await writeThisWeek(config, await readPublished(vault, now), now);
    log("This week note updated.");
  } catch (error) {
    if (!(error instanceof AppleNotesError)) throw error;
    log(`Warning: This week note not updated: ${error.message}`);
  }
  return true;
}
