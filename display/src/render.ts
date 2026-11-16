// Turns a screen from the deck into HTML. Checked by eye with `food preview`.
import type { IngredientList, NotesScreen, Screen, StepScreen, StepText, WeekRow, WeekScreen } from "./deck.ts";

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

/** A day's dinner on one line: "Dahl + Naan ×2", "↳ Dahl (leftovers)" or "Free Day". */
function dayLine(row: WeekRow): string {
  if (!row.dinner) return "Free Day";
  const dinner = row.leftovers ? `↳ ${esc(row.dinner)} <span class="muted">(leftovers)</span>` : esc(row.dinner);
  return dinner + (row.side ? ` <span class="muted">+ ${esc(row.side)}</span>` : "") + row.tags.map((t) => ` <span class="tag">${esc(t)}</span>`).join("");
}

function week(screen: WeekScreen): string {
  const rows = screen.days.map((row) => {
    const [weekday, ...date] = row.day.split(" ");
    const classes = ["row", row.today ? "today" : "", row.dinner ? "" : "free-hatch"].filter(Boolean).join(" ");
    return `<div class="${classes}"><div class="d">${esc(weekday)}<br>${esc(date.join(" "))}</div><div${row.leftovers ? ` class="second"` : ""}>${dayLine(row)}</div></div>`;
  });
  return head("Week Menu", `Published ${esc(screen.published)}`) + `<div class="fit week">${rows.join("")}</div>`;
}

function notes(screen: NotesScreen): string {
  const withNotes = screen.recipes.filter((r) => r.notes.length || r.source);
  const sections = withNotes.map(
    (r) =>
      (screen.recipes.length > 1 ? `<div class="grp">${esc(r.title)}</div>` : "") +
      r.notes.map((n) => `<p>${esc(n)}</p>`).join("") +
      (r.source ? `<p class="source">Source: ${esc(r.source)}</p>` : ""),
  );
  return head(esc(screen.recipes[0].title), "Notes") + `<div class="fit notes">${sections.join("") || `<p class="muted">No notes.</p>`}</div>`;
}

export function renderScreen(screen: Screen): string {
  switch (screen.kind) {
    case "week":
      return week(screen);
    case "message":
      return head(`${esc(screen.day)} · Today`) + `<div class="fit message">${esc(screen.message)}</div>`;
    case "free-day":
      return (
        head(`${esc(screen.day)} · Today`) +
        `<div class="fit free-hatch"><div class="message">${esc(screen.title)}</div><p class="lead">${esc(screen.message)}.</p></div>`
      );
    case "leftovers":
      return (
        head(`${esc(screen.day)} · Today`) +
        `<div class="fit"><div class="message">${esc(screen.title)}</div><p class="lead">${esc(screen.message)}.</p>` +
        (screen.tomorrow ? `<p class="tomorrow">Tomorrow: ${dayLine(screen.tomorrow)}</p>` : "") +
        `</div>`
      );
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
