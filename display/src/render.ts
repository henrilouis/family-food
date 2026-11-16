// Turns a screen from the deck into HTML. Checked by eye with `food preview`.
import type { IngredientList, Screen } from "./deck.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const head = (left: string) => `<div class="head"><b>${left}</b></div>`;

function ingredients(groups: IngredientList[], sideTitle?: string): string {
  return groups
    .map((g, i) => {
      const heading = g.heading ? `<div class="grp${sideTitle && i === 0 ? " side" : ""}">${esc(g.heading)}</div>` : "";
      const items = g.items.map((it) => `<li>${it.amount ? `<b>${esc(it.amount)}</b> ` : ""}${esc(it.text)}</li>`).join("");
      return `${heading}<ul class="ings">${items}</ul>`;
    })
    .join("");
}

export function renderScreen(screen: Screen): string {
  if (screen.kind === "message") return head(`${esc(screen.day)} · Today`) + `<div class="fit message">${esc(screen.message)}</div>`;
  return (
    head(`${esc(screen.day)} · Today`) +
    `<div class="fit">` +
    `<div class="title">${esc(screen.title)}</div>` +
    screen.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("") +
    (screen.side ? `<div class="with">with <b>${esc(screen.side)}</b></div>` : "") +
    `<div class="cols2">${ingredients(screen.ingredients)}${screen.side ? ingredients(screen.sideIngredients, screen.side) : ""}</div>` +
    `</div>`
  );
}
