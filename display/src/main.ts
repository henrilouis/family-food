// The Kitchen Display page: loads the display bundle, shows the deck from today's ingredients and pages through it by key.
import { BUNDLE_SCHEMA_VERSION, type DisplayBundle } from "../../bundle/bundle.ts";
import { buildDeck, isPageKey, press, type Deck } from "./deck.ts";
import { renderScreen } from "./render.ts";

const app = document.getElementById("app")!;
let deck: Deck | null = null;

/** Shrinks a screen's text, down to 45%, until it fits without scrolling. */
function fit(): void {
  for (const el of document.querySelectorAll<HTMLElement>(".fit")) {
    el.style.fontSize = "";
    const base = parseFloat(getComputedStyle(el).fontSize);
    for (let f = 100; el.scrollHeight > el.clientHeight + 1 && f > 45; ) {
      f -= 5;
      el.style.fontSize = `${(base * f) / 100}px`;
    }
  }
}

/** Cuts the steps to come at the last whole line that fits, ending it with "…", and hides the rest. */
function cutUpcoming(): void {
  const rest = document.querySelector<HTMLElement>(".rest");
  if (!rest) return;
  const bottom = rest.getBoundingClientRect().bottom;
  let cut = false;
  for (const el of rest.querySelectorAll<HTMLElement>(".next, .h")) {
    const box = el.getBoundingClientRect();
    if (cut) el.style.display = "none";
    if (cut || box.bottom <= bottom) continue;
    cut = true;
    const lines = Math.floor((bottom - box.top) / parseFloat(getComputedStyle(el).lineHeight));
    if (lines < 1) el.style.display = "none";
    else Object.assign(el.style, { display: "-webkit-box", webkitBoxOrient: "vertical", webkitLineClamp: String(lines), overflow: "hidden" });
  }
}

function render(): void {
  if (!deck) return;
  app.innerHTML = `<div class="screen">${renderScreen(deck.screens[deck.current])}</div>`;
  fit();
  cutUpcoming();
}

async function show(): Promise<void> {
  const bundle: DisplayBundle = await (await fetch("bundle.json", { cache: "no-store" })).json();
  if (bundle.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    throw new Error(`This page reads display bundle version ${BUNDLE_SCHEMA_VERSION}, not ${bundle.schemaVersion}.`);
  }
  deck = buildDeck(bundle, new Date());
  render();
}

show().catch((error) => {
  app.innerHTML = `<div class="screen"><div class="message"></div></div>`;
  app.querySelector(".message")!.textContent = String(error.message ?? error);
});
addEventListener("resize", render);
addEventListener("keydown", (event) => {
  if (!deck || !isPageKey(event.key)) return;
  event.preventDefault();
  const next = press(deck, event.key);
  if (next === deck) return;
  deck = next;
  render();
});
