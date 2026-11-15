// PROTOTYPE, throwaway. Answers "What does the Kitchen Display show?"
// Three variants of the Kitchen Display (A Deck, B Split, C Cursor), switchable via ?variant=, on one throwaway page.
// Reads the real Recipe Vault and a sample Week Menu note on every request, so edits show on reload.
// Run: node prototypes/kitchen-display/serve.mjs   then open the printed LAN URL in Fully on the Boox.

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const VAULT =
  process.env.VAULT ??
  path.join(os.homedir(), "Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes/Recipes");
const WEEK = process.env.WEEK ?? path.join(here, "week.md");
const PORT = Number(process.env.PORT ?? 8787);
const RECIPE_DIRS = ["Meals", "Sides or other"];

const stripLinks = (s) =>
  s.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, a, __, b) => b ?? a).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

function splitFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return [{}, md];
  const props = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) props[kv[1]] = kv[2].replace(/^"|"$/g, "");
  }
  return [props, md.slice(m[0].length)];
}

function parseRecipe(name, md) {
  const [props, body] = splitFrontmatter(md);
  const r = { name, title: name, serves: props.serves ?? null, groups: [], steps: [], notes: [], source: props.source ?? null };
  let section = null;
  let group = null;
  let lastStep = false;
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^# (.+)/))) { r.title = m[1].trim(); continue; }
    if ((m = line.match(/^## (.+)/))) { section = m[1].trim().toLowerCase(); group = null; lastStep = false; continue; }
    if ((m = line.match(/^### (.+)/))) {
      if (section === "ingredients") { group = { title: m[1].trim(), items: [] }; r.groups.push(group); }
      continue;
    }
    if (!section && (m = line.match(/^\*Serves ([^*]+)\*/i))) { r.serves = m[1].trim(); continue; }
    if (!line.trim()) { lastStep = false; continue; }
    if (section === "ingredients" && (m = line.match(/^\s*- (.+)/))) {
      if (!group) { group = { title: null, items: [] }; r.groups.push(group); }
      const text = m[1].trim();
      const am = text.match(/^\*([^*]+)\*\s*(.*)$/);
      group.items.push(am ? { amount: am[1].trim(), text: am[2] } : { amount: null, text });
      continue;
    }
    if (section === "method") {
      if (!r.methodDone && (m = line.match(/^\s*\d+\.\s+(.+)/))) { r.steps.push(m[1]); lastStep = true; continue; }
      if (lastStep && /^\s{2,}/.test(raw)) { r.steps[r.steps.length - 1] += " " + line.trim(); continue; }
      if (r.steps.length) r.methodDone = true;
      if (/^\*\*notes?:?\*\*:?$/i.test(line.trim())) continue;
      r.notes.push(line.replace(/^\s*[-\d.]+\s+/, "")); continue;
    }
    if (section === "source") { const u = line.match(/\((https?:[^)]+)\)/); r.source ??= u ? u[1] : line; continue; }
    if (section) r.notes.push(line.replace(/^\s*(-|\d+\.)\s+/, ""));
  }
  for (const g of r.groups) for (const it of g.items) it.text = stripLinks(it.text);
  r.steps = r.steps.map(stripLinks);
  r.notes = r.notes.map(stripLinks);
  return r;
}

function findRecipe(name) {
  // Prototype-only copies with amounts inline in the Method (proposed add-recipe format) win over the vault.
  const local = path.join(here, "recipes", `${name}.md`);
  if (fs.existsSync(local)) return parseRecipe(name, fs.readFileSync(local, "utf8"));
  for (const dir of RECIPE_DIRS) {
    const p = path.join(VAULT, dir, `${name}.md`);
    if (fs.existsSync(p)) return parseRecipe(name, fs.readFileSync(p, "utf8"));
  }
  return null;
}

function parseWeek(md) {
  const [props, body] = splitFrontmatter(md);
  const start = new Date(props.week_start + "T12:00:00");
  const rows = body.split("\n").filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1);
  const recipes = {};
  const cell = (s) => {
    const link = s.match(/\[\[([^\]|]+)/);
    if (!link) return s.trim() ? { name: s.trim(), linked: false } : null;
    const name = link[1].trim();
    recipes[name] ??= findRecipe(name);
    return { name, linked: true, found: !!recipes[name] };
  };
  const days = rows.map((row, i) => {
    const [label, dinner, side, note] = row.split("|").slice(1, -1).map((c) => c.trim());
    const date = new Date(start); date.setDate(start.getDate() + i);
    const free = /free day/i.test(dinner);
    return {
      label, date: date.toISOString().slice(0, 10),
      dow: date.toLocaleDateString("en-GB", { weekday: "short" }),
      dinner: free ? null : cell(dinner), side: free ? null : cell(side ?? ""), note: note ?? "", free,
    };
  });
  return { week: { start: props.week_start, novel: stripLinks(props.novel ?? ""), days }, recipes };
}

function page() {
  const data = parseWeek(fs.readFileSync(WEEK, "utf8"));
  const html = fs.readFileSync(path.join(here, "page.html"), "utf8");
  return html.replace("/*DATA*/", `window.DATA = ${JSON.stringify(data).replace(/</g, "\\u003c")};`);
}

if (process.argv.includes("--dump")) {
  console.log(JSON.stringify(parseWeek(fs.readFileSync(WEEK, "utf8")), null, 2));
  process.exit(0);
}

http
  .createServer((req, res) => {
    try {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(page());
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e.stack));
    }
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log("Kitchen Display PROTOTYPE");
    for (const nets of Object.values(os.networkInterfaces()))
      for (const n of nets ?? []) if (n.family === "IPv4") console.log(`  http://${n.address}:${PORT}/?variant=A`);
  });
