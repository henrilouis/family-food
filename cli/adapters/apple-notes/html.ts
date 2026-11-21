// Note bodies as the Notes app's AppleScript reads and writes them: HTML with one block per line,
// e.g. `<div><h1>Food wishes</h1></div><div>Pasta pesto</div><div><br></div><ul><li>Easy week</li></ul>`.

/** A line of a note's text, and the block element it came from (null for text outside any block). */
export type Line = { text: string; block: number | null };

type Block = { start: number; end: number };

export type ParsedNote = { html: string; blocks: Block[]; lines: Line[] };

/** A block element holding no other blocks: one line of the note, or a few joined by `<br>`. */
const LEAF_BLOCK = /<(div|p|li|h[1-6])\b[^>]*>((?:(?!<\/?(?:div|p|li|h[1-6]|ul|ol)\b)[\s\S])*?)<\/\1\s*>/gi;
const BREAK = /<br\s*\/?>/i;

export function parseNote(html: string): ParsedNote {
  const blocks: Block[] = [];
  const lines: Line[] = [];
  const looseLines = (text: string) => {
    for (const line of toText(text.replace(/<\/?(?:div|p|li|h[1-6]|ul|ol|br)\b[^>]*>/gi, "\n")).split("\n")) {
      if (line.trim()) lines.push({ text: clean(line), block: null });
    }
  };
  let last = 0;
  for (const match of html.matchAll(LEAF_BLOCK)) {
    looseLines(html.slice(last, match.index));
    const block = blocks.push({ start: match.index, end: match.index + match[0].length }) - 1;
    const parts = match[2].split(BREAK).map((part) => clean(toText(part)));
    // A trailing <br> ends the block's last line rather than adding an empty one.
    if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
    for (const text of parts) lines.push({ text, block });
    last = match.index + match[0].length;
  }
  looseLines(html.slice(last));
  return { html, blocks, lines };
}

/** The note's lines below its name (the first line that isn't blank). */
export function bodyLines(note: ParsedNote): Line[] {
  const title = note.lines.findIndex((line) => line.text !== "");
  return note.lines.slice(title + 1);
}

/**
 * The note's HTML without `remove` (lines of `note.lines`), the other blocks and their formatting kept.
 * A block losing only some of its lines keeps the rest as plain text; when a removed line sits outside
 * any block, the whole note is rewritten as plain lines.
 */
export function withoutLines(note: ParsedNote, remove: Set<Line>): string {
  if ([...remove].some((line) => line.block === null)) {
    return note.lines.filter((line) => !remove.has(line)).map((line) => `<div>${line.text ? escapeHtml(line.text) : "<br>"}</div>\n`).join("");
  }
  let html = note.html;
  for (let index = note.blocks.length - 1; index >= 0; index--) {
    const lines = note.lines.filter((line) => line.block === index);
    const kept = lines.filter((line) => !remove.has(line));
    if (kept.length === lines.length) continue;
    const { start, end } = note.blocks[index];
    if (kept.length === 0) {
      html = html.slice(0, start) + html.slice(html[end] === "\n" ? end + 1 : end);
    } else {
      const block = html.slice(start, end);
      const open = block.match(/^<[^>]*>/)![0];
      const close = block.match(/<\/[^>]*>$/)![0];
      html = html.slice(0, start) + open + kept.map((line) => escapeHtml(line.text)).join("<br>") + close + html.slice(end);
    }
  }
  // Lists and wrappers left empty go too.
  const emptyWrapper = /<(div|ul|ol)\b[^>]*>\s*<\/\1>\n?/gi;
  for (let before = ""; before !== html; ) [before, html] = [html, html.replace(emptyWrapper, "")];
  return html;
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function toText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] === "#") return String.fromCodePoint(name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
      return ENTITIES[name.toLowerCase()] ?? entity;
    });
}

export const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A line of a note to write: text, "" for a blank line, or a heading. */
export type NoteLine = string | { heading: string };

/** A whole note body: its name as the title, then `lines`. */
export function noteHtml(title: string, lines: NoteLine[]): string {
  const block = (line: NoteLine) =>
    typeof line !== "string" ? `<div><h2>${escapeHtml(line.heading)}</h2></div>` : `<div>${line ? escapeHtml(line) : "<br>"}</div>`;
  return [`<div><h1>${escapeHtml(title)}</h1></div>`, ...lines.map(block)].join("\n");
}
