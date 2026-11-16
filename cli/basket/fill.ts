import { inWeek } from "../../bundle/dates.ts";
import { AhError, AhLoginError, AhUnavailableError } from "../adapters/ah/client.ts";
import type { AhGateway, OrderInFocus } from "../adapters/ah/gateway.ts";
import { productTitle, type BasketPlan, type PlannedProduct } from "./quantities.ts";

/**
 * What the Week Menu needs beyond what an earlier run recorded in `## Basket` (`add`, `addNotes`; quantities are
 * the difference), and what that run added that is no longer needed (`remove`, `removeNotes`).
 */
export type BasketChange = {
  add: PlannedProduct[];
  addNotes: string[];
  remove: { id: number; title: string; quantity: number }[];
  removeNotes: string[];
};

function changeSince(plan: BasketPlan): BasketChange {
  const { recorded } = plan;
  const recordedQuantity = (id: number) => recorded.products.find((p) => p.id === id)?.quantity ?? 0;
  const plannedQuantity = (id: number) => plan.products.find((p) => p.id === id)?.quantity ?? 0;
  return {
    add: plan.products.map((p) => ({ ...p, quantity: p.quantity - recordedQuantity(p.id) })).filter((p) => p.quantity > 0),
    addNotes: plan.notes.filter((note) => !recorded.notes.includes(note)),
    remove: recorded.products.map((p) => ({ ...p, quantity: p.quantity - plannedQuantity(p.id) })).filter((p) => p.quantity > 0),
    removeNotes: recorded.notes.filter((note) => !plan.notes.includes(note)),
  };
}

/** A product of the plan once Mijn lijst is filled: what this run added, what Mijn lijst had before (0 when new), AH's title and pack price. */
export type FilledProduct = PlannedProduct & { title: string; added: number; before: number; price: number | null };

/** What `food basket fill` did. */
export type BasketOutcome =
  /**
   * Mijn lijst is filled, or with `into` set, the order open for changes in the AH app: its products went there,
   * its notes to Mijn lijst. `change` only holds removals still possible: what is still in Mijn lijst or that order.
   * `total` is the estimated total of Mijn lijst's or that order's products after adding, from the prices AH gives.
   */
  | { kind: "filled"; plan: BasketPlan; change: BasketChange; products: FilledProduct[]; total: number; into: OrderInFocus | null }
  /** An order delivering in the Week Menu's week is placed: nothing was written to AH. */
  | { kind: "order placed"; plan: BasketPlan; change: BasketChange; order: { id: number; status: string; date: string } }
  /** An order for another week is open for changes in the AH app, so products would go into it: nothing was written to AH. */
  | { kind: "other order in focus"; plan: BasketPlan; change: BasketChange; order: OrderInFocus }
  /** AH refused the login, also after logging in again: nothing was written to AH. */
  | { kind: "login failed"; plan: BasketPlan; change: BasketChange; error: string }
  /** AH didn't answer: nothing was written to AH, the shopping list goes in the `## Basket` section. */
  | { kind: "AH down"; plan: BasketPlan; change: BasketChange; error: string };

/**
 * Adds to Mijn lijst what the plan needs beyond what an earlier run recorded: products merge into lines already
 * there, unmatched items go in as free-text notes. Never removes anything; what is no longer needed is only listed.
 * While the week's empty order is open for changes in the AH app, the products go into it instead (AH does that).
 * Writes nothing once an order delivering in the Week Menu's week is placed, nor while an order for another week is
 * open for changes. When AH refuses the login, `log`s a prompt and runs
 * the browser login once; if AH still refuses, writes nothing. Writes nothing either when AH doesn't answer.
 */
export async function fillBasket(plan: BasketPlan, gateway: AhGateway, log: (line: string) => void): Promise<BasketOutcome> {
  const change = changeSince(plan);
  try {
    return await fillOrRelogin(gateway, plan, change, log);
  } catch (error) {
    if (!(error instanceof AhUnavailableError)) throw error;
    return { kind: "AH down", plan, change, error: error.message };
  }
}

async function fillOrRelogin(gateway: AhGateway, plan: BasketPlan, change: BasketChange, log: (line: string) => void): Promise<BasketOutcome> {
  try {
    return await fillWith(gateway, plan, change);
  } catch (error) {
    if (!(error instanceof AhLoginError)) throw error;
  }
  log("AH login expired: log in again in the browser window that opens.");
  try {
    await gateway.login();
  } catch (error) {
    if (!(error instanceof AhError) || error instanceof AhUnavailableError) throw error;
    return { kind: "login failed", plan, change, error: error.message };
  }
  try {
    return await fillWith(gateway, plan, change);
  } catch (error) {
    if (!(error instanceof AhLoginError)) throw error;
    return { kind: "login failed", plan, change, error: error.message };
  }
}

async function fillWith(gateway: AhGateway, plan: BasketPlan, change: BasketChange): Promise<BasketOutcome> {
  const order = await gateway.placedOrder(plan.weekStart);
  if (order) return { kind: "order placed", plan, change, order };
  const focus = await gateway.orderInFocus();
  if (focus && !inWeek(plan.weekStart, focus.date)) return { kind: "other order in focus", plan, change, order: focus };

  const list = await gateway.readBasket();
  const before = focus ? { products: focus.products, notes: list.notes } : list;
  const additions = {
    products: change.add.map(({ id, quantity }) => ({ id, quantity })),
    notes: change.addNotes.map((description) => ({ description, quantity: 1 })),
  };
  const written = additions.products.length || additions.notes.length ? await gateway.addToBasket(additions) : list;
  const after = focus ? { products: (await gateway.orderInFocus())?.products ?? [], notes: written.notes } : written;
  const inList = (id: number) => before.products.find((p) => p.id === id)?.quantity ?? 0;
  return {
    kind: "filled",
    plan,
    into: focus,
    change: {
      ...change,
      remove: change.remove.map((p) => ({ ...p, quantity: Math.min(p.quantity, inList(p.id)) })).filter((p) => p.quantity > 0),
      removeNotes: change.removeNotes.filter((note) => before.notes.some((n) => n.description === note)),
    },
    products: plan.products.map((p) => ({
      ...p,
      title: after.products.find((line) => line.id === p.id)?.title ?? productTitle(plan, p),
      price: after.products.find((line) => line.id === p.id)?.price ?? null,
      added: change.add.find((a) => a.id === p.id)?.quantity ?? 0,
      before: inList(p.id),
    })),
    total: after.products.reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0),
  };
}

/** The exit code for `food basket fill`: 2 when nothing was written to AH and a human must act on the output. */
export function exitCode(outcome: BasketOutcome): number {
  if (outcome.kind === "filled") return 0;
  if (outcome.kind === "order placed" && filledBefore(outcome.plan) && unchanged(outcome.change)) return 0;
  return 2;
}

/** An earlier run filled Mijn lijst for the week (its `## Basket` section has products or notes). */
export function filledBefore(plan: BasketPlan): boolean {
  return plan.recorded.products.length > 0 || plan.recorded.notes.length > 0;
}

export function unchanged(change: BasketChange): boolean {
  return !change.add.length && !change.addNotes.length && !change.remove.length && !change.removeNotes.length;
}
