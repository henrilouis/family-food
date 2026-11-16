// The Kitchen Display page: loads the display bundle and shows today's screen.
import { BUNDLE_SCHEMA_VERSION, type DisplayBundle } from "../../bundle/bundle.ts";
import { buildDeck } from "./deck.ts";
import { renderScreen } from "./render.ts";

const app = document.getElementById("app")!;

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

async function show(): Promise<void> {
  const bundle: DisplayBundle = await (await fetch("bundle.json", { cache: "no-store" })).json();
  if (bundle.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    throw new Error(`This page reads display bundle version ${BUNDLE_SCHEMA_VERSION}, not ${bundle.schemaVersion}.`);
  }
  const deck = buildDeck(bundle, new Date());
  app.innerHTML = `<div class="screen">${renderScreen(deck.screens[deck.current])}</div>`;
  fit();
}

show().catch((error) => {
  app.innerHTML = `<div class="screen"><div class="message"></div></div>`;
  app.querySelector(".message")!.textContent = String(error.message ?? error);
});
addEventListener("resize", fit);
