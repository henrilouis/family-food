import { execFile } from "node:child_process";
import { AppleNotesError, AppleNotesWriteError, FOLDER, type NotesClient } from "./client.ts";

// Notes reaches a folder shared by another Apple ID like any other folder of the iCloud account.
const FIND_NOTE = `
  set matchingFolders to (folders whose name is folderName)
  if matchingFolders is {} then error "No folder \\"" & folderName & "\\" in Apple Notes." number 1001
  set theFolder to item 1 of matchingFolders
  set matchingNotes to (notes of theFolder whose name is noteName)`;

const READ = `on run {folderName, noteName}
  tell application "Notes"${FIND_NOTE}
    if matchingNotes is {} then error "No note \\"" & noteName & "\\" in the Apple Notes folder \\"" & folderName & "\\"." number 1002
    return body of item 1 of matchingNotes
  end tell
end run`;

const WRITE = `on run {folderName, noteName, html}
  tell application "Notes"${FIND_NOTE}
    if matchingNotes is {} then
      make new note at theFolder with properties {body:html}
    else
      set body of item 1 of matchingNotes to html
    end if
  end tell
end run`;

/** The real Apple Notes, through AppleScript (`osascript`), on this Mac's Notes app. */
export function osascriptNotesClient(): NotesClient {
  return {
    readBody: (note) => osascript(READ, [FOLDER, note], AppleNotesError),
    async writeBody(note, html) {
      await osascript(WRITE, [FOLDER, note, html], AppleNotesWriteError);
    },
  };
}

function osascript(script: string, args: string[], failure: typeof AppleNotesError): Promise<string> {
  // A safety net: tests must never touch the household's real notes, only the fake.
  if (process.env.VITEST) return Promise.reject(new failure("The real Apple Notes are off in tests; use the apple-notes fake."));
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script, ...args], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout.replace(/\n$/, ""));
      const said = (stderr || error.message).trim().replace(/^.*?execution error: /, "");
      const hint = /-1743/.test(said)
        ? " Allow this terminal to control Notes in System Settings → Privacy & Security → Automation."
        : "";
      reject(new failure(`Apple Notes: ${said}${hint}`));
    });
  });
}
