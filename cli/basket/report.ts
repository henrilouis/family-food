import { dayLabel, timeLabel } from "../../bundle/dates.ts";
import { filledBefore, unchanged, type BasketChange, type BasketOutcome } from "./fill.ts";
import { productTitle, type BasketPlan, type PlannedProduct, type ShoppingGroup } from "./quantities.ts";

/** What to tell the person filling the Basket. */
export function formatReport(outcome: BasketOutcome): string {
  switch (outcome.kind) {
    case "filled":
      return formatFilled(outcome);
    case "order placed": {
      const { plan, change, order } = outcome;
      const placed = `The order for ${dayLabel(order.date, { long: true })} is already placed`;
      if (!filledBefore(plan)) {
        return [`${placed}, so nothing was added to Mijn lijst.\n`, formatLinks(change), formatShoppingList(plan, change, "Shopping list")].join("");
      }
      if (unchanged(change)) return `${placed} and has what the Week Menu needs: nothing to change.\n`;
      return [
        `${placed}, so nothing was changed in AH.\n`,
        "The Week Menu changed since the Basket was filled. Change the order in Mijn bestellingen:\n",
        group("Add to the order", change.add.map((p) => `${p.quantity} × ${productTitle(plan, p)}: ${p.covers.join(", ")}`)),
        group("Remove from the order", change.remove.map((p) => `${p.quantity} × ${p.title}`)),
        change.addNotes.length ? group("Unmatched, buy these yourself", change.addNotes) : "",
        change.removeNotes.length ? group("Unmatched, no longer needed", change.removeNotes) : "",
      ].join("");
    }
    case "AH down": {
      const { plan, change } = outcome;
      return formatShoppingList(
        plan,
        change,
        "AH ordering is down, so nothing was added to Mijn lijst. The shopping list is in the Week Menu's ## Basket section",
      );
    }
    case "login failed":
      return [
        "The AH login failed again, so nothing was added to Mijn lijst.\n",
        formatLinks(outcome.change),
        formatShoppingList(outcome.plan, outcome.change, "Shopping list"),
      ].join("");
    case "other order in focus": {
      const order = orderLabel(outcome.order.date);
      return [
        `The ${order} is open for changes in the AH app, so nothing was added: AH would put the products into that order.\n`,
        "Submit that order or undo its changes in the app, then fill the Basket again.\n",
      ].join("");
    }
  }
}

/** "order for Saturday 28 Nov". */
function orderLabel(date: string): string {
  return `order for ${dayLabel(date, { long: true })}`;
}

function formatFilled({ plan, change, products, total, into }: Extract<BasketOutcome, { kind: "filled" }>): string {
  const where = into ? `the ${orderLabel(into.date)}` : "Mijn lijst";
  const added = products.filter((p) => p.added > 0 && p.before === 0);
  const alreadyThere = products.filter((p) => p.added > 0 && p.before > 0);
  const unchanged = [
    ...products.filter((p) => p.added === 0).map((p) => `${p.quantity} × ${p.title}`),
    ...plan.notes.filter((note) => !change.addNotes.includes(note)).map((note) => `Note: ${note}`),
  ];
  return [
    group(`Added to ${where}`, added.map((p) => `${p.added} × ${p.title}${p.price === null ? "" : ` (${euro(p.price)} each)`}`)),
    group(`Already in ${where}, added on top`, alreadyThere.map((p) => `${p.title}: ${p.before} + ${p.added} = ${p.before + p.added}`)),
    unchanged.length ? group("Added on an earlier run, unchanged", unchanged) : "",
    group(`No longer needed, remove these from ${where} by hand`, [
      ...change.remove.map((p) => `${p.quantity} × ${p.title}`),
      ...change.removeNotes.map((note) => `Note: ${note}`),
    ]),
    group(into ? "Unmatched, added as notes to Mijn lijst" : "Unmatched, added as notes", change.addNotes),
    group("Optional, not added", plan.optional),
    `Have at home: ${plan.haveAtHome.join(", ") || "none"}\n`,
    `Estimated total: ${euro(total)}\n`,
    into
      ? `\nThe ${orderLabel(into.date)} was open for changes in the AH app, so the products went straight into it.\n` +
        `Check it and submit it before ${into.closes ? timeLabel(into.closes) : "it closes"}.\n`
      : "\nCheck out into the Saturday slot before Friday 12:00.\n",
  ].join("");
}

/** AH's own add-multiple links for the products to add, at most this many products per link (AH drops the rest). */
const LINK_SIZE = 25;

function formatLinks(change: BasketChange): string {
  const links: string[] = [];
  for (let i = 0; i < change.add.length; i += LINK_SIZE) {
    const products = change.add.slice(i, i + LINK_SIZE);
    links.push(`https://www.ah.nl/mijnlijst/add-multiple?${products.map((p) => `p=${p.id}:${p.quantity}`).join("&")}`);
  }
  return [
    "Open each link in a browser where you are logged in to ah.nl: it adds its products to Mijn lijst\n",
    "(once an order is placed, that is the order). Or shop from the list below.\n",
    group("Links", links),
    "\n",
  ].join("");
}

/** Under `heading`, the products to add and the unmatched items, grouped for shopping by hand; then what an earlier run added that is no longer needed. */
function formatShoppingList(plan: BasketPlan, change: BasketChange, heading: string): string {
  const noLongerNeeded = [...change.remove.map((p) => `${p.quantity} × ${p.title}`), ...change.removeNotes.map((note) => `Note: ${note}`)];
  return [
    `${heading}:\n`,
    shoppingList(plan, change).join("\n") + "\n",
    noLongerNeeded.length ? group("No longer needed, remove these from Mijn lijst by hand", noLongerNeeded) : "",
    group("Optional, not added", plan.optional),
    `Have at home: ${plan.haveAtHome.join(", ") || "none"}\n`,
  ].join("");
}

/** "Fresh:", "Cupboard Ingredients:", "Staples:" and "Unmatched:" with their items; empty groups left out. */
export function shoppingList(plan: BasketPlan, change: BasketChange): string[] {
  const groups: ShoppingGroup[] = ["Fresh", "Cupboard Ingredients", "Staples"];
  const item = (p: PlannedProduct) => {
    const title = plan.recorded.products.find((r) => r.id === p.id)?.title ?? p.title;
    return title ? `${p.quantity} × ${title}: ${p.covers.join(", ")}` : `${p.quantity} × ${p.covers.join(", ")}`;
  };
  const list = [
    ...groups.map((name) => [name, change.add.filter((p) => p.group === name).map(item)] as const),
    ["Unmatched", change.addNotes] as const,
  ]
    .filter(([, items]) => items.length)
    .flatMap(([name, items]) => [`${name}:`, ...items.map((i) => `- ${i}`)]);
  return list.length ? list : ["Nothing more to buy."];
}

function euro(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

/** A report group: "<heading>:" and one "- " line per item, or "<heading>: none". */
function group(heading: string, items: string[]): string {
  return items.length ? `${heading}:\n${items.map((i) => `- ${i}\n`).join("")}` : `${heading}: none\n`;
}
