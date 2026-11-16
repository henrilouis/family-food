// The Kitchen Display page: loads the display bundle, shows the deck from today's ingredients and pages through it by key.
// It polls the version file and reloads when a Publish changed the bundle, back on the cook's place.
import { BUNDLE_FILE, BUNDLE_SCHEMA_VERSION, VERSION_FILE, type BundleVersion, type DisplayBundle } from "../../bundle/bundle.ts";
import { kitchenDate, nextDayStart } from "../../bundle/kitchen-day.ts";
import { buildDeck, isPageKey, press, type Deck } from "./deck.ts";
import { placeOf, restorePlace, type Place } from "./place.ts";
import { renderScreen } from "./render.ts";

const POLL_EVERY_MS = 5 * 60_000;
const PLACE_KEY = "kitchen-display.place";

const app = document.getElementById("app")!;
let bundle: DisplayBundle | null = null;
let deck: Deck | null = null;
/** The kitchen date the deck was built for. */
let day: string | null = null;
/** The hash of the bundle on show; null when the version file couldn't be read. */
let version: string | null = null;

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

async function fetchVersion(): Promise<string | null> {
  try {
    const response = await fetch(VERSION_FILE, { cache: "no-store" });
    return response.ok ? ((await response.json()) as BundleVersion).hash : null;
  } catch {
    return null;
  }
}

function savedPlace(): Place | null {
  try {
    return JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null");
  } catch {
    return null;
  }
}

function savePlace(): void {
  if (deck) localStorage.setItem(PLACE_KEY, JSON.stringify(placeOf(deck, new Date())));
}

async function show(): Promise<void> {
  version = await fetchVersion();
  const loaded: DisplayBundle = await (await fetch(BUNDLE_FILE, { cache: "no-store" })).json();
  if (loaded.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    throw new Error(`This page reads display bundle version ${BUNDLE_SCHEMA_VERSION}, not ${loaded.schemaVersion}.`);
  }
  bundle = loaded;
  const now = new Date();
  day = kitchenDate(now);
  deck = restorePlace(buildDeck(bundle, now), savedPlace(), now);
  render();
}

/** At 03:00 the kitchen's day changes: the deck starts over on the new day's ingredients. */
function waitForNextDay(): void {
  setTimeout(() => {
    const now = new Date();
    if (bundle && kitchenDate(now) !== day) {
      day = kitchenDate(now);
      deck = buildDeck(bundle, now);
      savePlace();
      render();
    }
    waitForNextDay();
  }, nextDayStart(new Date()).getTime() - Date.now());
}

/** Reloads the page when a Publish changed the bundle; the place was saved on the last page turn. */
async function pollVersion(): Promise<void> {
  const latest = await fetchVersion();
  if (latest !== null && latest !== version) location.reload();
}

show().catch((error) => {
  app.innerHTML = `<div class="screen"><div class="message"></div></div>`;
  app.querySelector(".message")!.textContent = String(error.message ?? error);
});
setInterval(pollVersion, POLL_EVERY_MS);
waitForNextDay();
addEventListener("resize", render);
addEventListener("keydown", (event) => {
  if (!deck || !isPageKey(event.key)) return;
  event.preventDefault();
  const next = press(deck, event.key);
  if (next === deck) return;
  deck = next;
  savePlace();
  render();
});
