import { UserError } from "../../user-error.ts";

/** The shared Apple Notes folder the partner takes part through (ADR 0001). */
export const FOLDER = "Family food";

/**
 * The raw layer under the Family food notes: one note's body as the Notes app's AppleScript gives it
 * (HTML, its first line being the note's name). The real one is AppleScript, the fake a local folder.
 */
export interface NotesClient {
  /** The note's body; AppleNotesError when Notes, the folder or the note can't be reached. */
  readBody(note: string): Promise<string>;
  /** Replaces the note's whole body, making the note when it doesn't exist; AppleNotesWriteError when Notes refuses. */
  writeBody(note: string, html: string): Promise<void>;
}

/** Apple Notes could not be read or written; the message says what Notes said. */
export class AppleNotesError extends UserError {}

/** A write to a note failed or didn't stick: whatever was to change must be changed by hand. */
export class AppleNotesWriteError extends AppleNotesError {}
