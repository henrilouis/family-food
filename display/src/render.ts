// Turns a screen from the deck into HTML. Checked by eye with `food preview`.
import type { IngredientList, NotesScreen, Screen, StepScreen, StepText } from "./deck.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const head = (left: string, right = "") => `<div class="head"><b>${left}</b><span>${right}</span></div>`;

function ingredients(groups: IngredientList[]): string {
  return groups
    .map((g) => {
      const heading = g.heading ? `<div class="grp">${esc(g.heading)}</div>` : "";
      const items = g.items.map((it) => `<li>${it.amount ? `<b>${esc(it.amount)}</b> ` : ""}${esc(it.text)}</li>`).join("");
      return `${heading}<ul class="ings">${items}</ul>`;
    })
    .join("");
}

const stepText = (text: StepText) =>
  text.map((part) => (typeof part === "string" ? esc(part) : `<b class="ing">${esc([part.amount, part.ingredient].filter(Boolean).join(" "))}</b>`)).join("");

function step(screen: StepScreen): string {
  const upcoming = screen.upcoming
    .map((u) => (u.heading ? `<div class="h">${esc(u.heading)}</div>` : "") + `<div class="next"><span class="n">${u.step}.</span>${stepText(u.text)}</div>`)
    .join("");
  const { at, of } = screen.progress;
  return (
    head(esc(screen.recipe), `Step ${screen.step} of ${screen.steps}`) +
    `<div class="fit cur"><div class="step">${stepText(screen.text)}</div></div>` +
    `<div class="rest">${upcoming || `<div class="h">Last step</div><div class="next">▼ Notes</div>`}</div>` +
    `<div class="prog">${Array.from({ length: of }, (_, q) => `<i${q < at ? ` class="on"` : ""}></i>`).join("")}</div>`
  );
}

function notes(screen: NotesScreen): string {
  const sections = screen.recipes.map(
    (r) =>
      (screen.recipes.length > 1 ? `<div class="grp">${esc(r.title)}</div>` : "") +
      (r.notes.length ? r.notes.map((n) => `<p>${esc(n)}</p>`).join("") : `<p class="muted">No notes.</p>`) +
      (r.source ? `<p class="source">Source: ${esc(r.source)}</p>` : ""),
  );
  return head(esc(screen.recipes[0].title), "Notes") + `<div class="fit notes">${sections.join("")}</div>`;
}

export function renderScreen(screen: Screen): string {
  switch (screen.kind) {
    case "message":
      return head(`${esc(screen.day)} · Today`) + `<div class="fit message">${esc(screen.message)}</div>`;
    case "step":
      return step(screen);
    case "notes":
      return notes(screen);
    case "ingredients": {
      const { side } = screen;
      return (
        head(`${esc(screen.day)} · Today`) +
        `<div class="fit">` +
        `<div class="title">${esc(screen.title)}</div>` +
        screen.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("") +
        (side ? `<div class="with">with <b>${esc(side.title)}</b></div>` : "") +
        `<div class="cols2">${ingredients(screen.ingredients)}` +
        (side ? `<div class="grp side">${esc(side.title)}</div>${ingredients(side.ingredients)}` : "") +
        `</div></div>`
      );
    }
  }
}
