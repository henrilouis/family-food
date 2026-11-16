// Turns a screen from the deck into HTML. Checked by eye with `food preview`.
import type { IngredientList, Screen } from "./deck.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function ingredients(groups: IngredientList[]): string {
  return groups
    .map((g) => {
      const heading = g.heading ? `<div class="grp">${esc(g.heading)}</div>` : "";
      const items = g.items.map((it) => `<li>${it.amount ? `<b>${esc(it.amount)}</b> ` : ""}${esc(it.text)}</li>`).join("");
      return `${heading}<ul class="ings">${items}</ul>`;
    })
    .join("");
}

function body(screen: Screen): string {
  if (screen.kind === "message") return `<div class="fit message">${esc(screen.message)}</div>`;
  const { side } = screen;
  return (
    `<div class="fit">` +
    `<div class="title">${esc(screen.title)}</div>` +
    screen.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("") +
    (side ? `<div class="with">with <b>${esc(side.title)}</b></div>` : "") +
    `<div class="cols2">${ingredients(screen.ingredients)}` +
    (side ? `<div class="grp side">${esc(side.title)}</div>${ingredients(side.ingredients)}` : "") +
    `</div></div>`
  );
}

export function renderScreen(screen: Screen): string {
  return `<div class="head"><b>${esc(screen.day)} · Today</b></div>` + body(screen);
}
