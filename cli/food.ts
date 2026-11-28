#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { allerhandeRecipeId } from "./adapters/ah/allerhande.ts";
import { ahGateway } from "./adapters/ah/gateway.ts";
import { familyNotes, FOOD_WISHES, RECIPES_TO_ADD, type Deletion } from "./adapters/apple-notes/notes.ts";
import { obsidianWarning } from "./adapters/obsidian.ts";
import { parseMeasure } from "./amount.ts";
import { exitCode, fillBasket } from "./basket/fill.ts";
import { planBasket, readBasketInput } from "./basket/quantities.ts";
import { formatReport } from "./basket/report.ts";
import { writeBasketSection } from "./basket/section.ts";
import { checkVault, formatCheck } from "./check.ts";
import { readConfig, writeConfig } from "./config.ts";
import { readJsonFile } from "./json-file.ts";
import { listBasketLines, PinInputError, pinProducts, type PinnedProduct } from "./pinned-products.ts";
import { deleteRecipe, planContext, recordVerdict, siteTrackRecord, writeWeekMenu, type LockedWeekMenu } from "./plan.ts";
import { publish } from "./publish.ts";
import { publishedWeekMenusWith } from "./published.ts";
import { fetchRecipePage, RecipePageError, RecipePageRefused } from "./recipe-page.ts";
import { UserError } from "./user-error.ts";

const usage = `Usage: food <command>

Commands:
  config vault <path>   Set the Recipe Vault path in the local config
  config                Show the local config
  vault check [--published] [--json]
                        Check the Recipe Vault's format: errors (exit 1, block Publish) and warnings.
                        --published checks only the Week Menus and Recipes a Publish would send;
                        --json prints {"errors": [...], "warnings": [...]} with {file, message} items
  publish               Send the current and upcoming Week Menus to the shared "This week" Apple Note:
                        vault check (errors stop it, exit 1), then rewrite the note (a failure there warns,
                        exit stays 0)
  ah login              Log in to Albert Heijn in your browser (once; the token stays on this Mac)
  ah refresh            Renew the AH login now (says so when you need to log in again)
  ah search <query> [--need <amount>]
                        Search AH products, cleaned up and cheapest per kg, l or piece first (JSON);
                        --need (e.g. 400g, 1.5l, 3 for pieces) drops packs that would waste too much
  ah bought <query>     Search the products the household bought before, most often bought first (JSON)
  ah basket             Show Mijn lijst (JSON): products with title, quantity and price, and free-text notes
  ah recipes [<text>] [--season <seizoen>] [--cuisine <keuken>] [--size <n>]
                        Search Allerhande's vegetarian main courses (JSON): url, title, servings, minutes, tags
                        and rating as in recipe fetch; season and cuisine are Allerhande's Dutch values
                        (winter, italiaans); no advertorials or baby food
  ah suggestions <allerhande url>
                        AH's product for each ingredient of an Allerhande recipe (JSON): ingredient, optional,
                        product {id, title, size, price} or null, packs
  basket lines --week <YYYY-MM-DD>
                        The ingredient lines of the Recipes a Locked Week Menu buys (JSON): recipe, line,
                        ingredient, times (dinners), optional, the Pinned Product from Products.md, and for
                        pinned lines its ready Match ("match") for basket fill (packFraction null when the line's
                        amount and the Pack don't compare)
  products pin <pins.json>
                        Pin the products of confirmed Matches in Products.md ([{ingredient, product, title, pack, kind}];
                        product null for none); a pin for an ingredient already there replaces its row
  basket fill --week <YYYY-MM-DD> <matches.json>
                        Fill Mijn lijst for a Locked Week Menu from the fill-basket skill's Matches
                        ({"lines": [{recipe, line, product, packFraction, kind}], "haveAtHome": [ids]}):
                        Doubles ×2 (×1 when written for both days), Staples added, summed and rounded to whole packs, unmatched lines as
                        notes; an optional line only when it has an entry. Writes the Week Menu's ## Basket
                        section and a report.
                        Run again, adds only the difference with ## Basket and takes out of Mijn lijst what an
                        earlier run added that is no longer needed (while an order is open for changes in the AH
                        app, only lists it).
                        On an expired AH login, opens the AH login once. Exit 2 when nothing was written to AH:
                        order already placed (add-multiple links and a shopping list, or an add-and-remove
                        list for Mijn bestellingen after a menu change), login failed (links and the list),
                        AH down (the list, also in ## Basket)
  basket remove [--product <id>[:<packs>]]... [--note <text>]...
                        Take products (all of the line, or that many packs) and free-text notes out of Mijn lijst,
                        whatever added them; prints what was removed and what wasn't there. Refuses while an
                        order is open for changes in the AH app
  notes wishes [--json] List the Wishes in the shared Apple Note "Food wishes", one per line
  notes wishes delete <wish>... [--json]
                        Delete Wishes once a Week Menu honours them
  notes recipes-to-add [--json]
                        List the items in "Recipes to add": each URL, and each pasted recipe as one item
  notes recipes-to-add remove <item>... [--json]
                        Remove items once imported (give them exactly as listed)
                        Deleting prints {"deleted", "notFound", "deleteByHand", "error"} with --json.
                        Exit 2 when Notes won't take the change: delete the "deleteByHand" items by hand.
                        (food publish also rewrites the "This week" note; a failure there only warns)
  recipe fetch <url>    Read the schema.org Recipe on an open recipe site's page (JSON, with its rating out
                        of 5 and how many rated it), fetched with an honest User-Agent; an Allerhande recipe
                        (ah.nl/allerhande/recept/R-R<number>) is read through AH's app API in the same shape.
                        Exit 2: a site food never fetches from (NYT Cooking, Serious Eats, The Guardian) or
                        another ah.nl page: ask for the recipe text instead.
                        Exit 3: no recipe data (fetch failed or none on the page): read the page another way
  recipe published <name> [--json]
                        Name the published Week Menus that link Recipe <name> (as a dinner or a side):
                        if there are any, an edit to it needs \`food publish\`
  recipe delete <name>  Delete a Recipe (a 👎 Novel Recipe) and turn the Week Menus' links to it into plain text
  plan context          What a Planning Session needs (JSON): the week to plan (the next Saturday; late once
                        the Friday before is past 12:00), the Novel Recipe to review, the last 3 Week Menus'
                        dinners, Novel Recipe sources with a 👎, and every Meal with its properties and when
                        it was last planned
  plan verdict <week_start> <kept|rejected|not cooked>
                        Record the verdict on that Week Menu's Novel Recipe; kept or rejected clears its novel
  plan sites            Each recipe site's track record (JSON): its Novel Recipes kept, rejected and not cooked
                        (from the Week Menus) and the Meals whose source is on it
  plan write <week-menu.json>
                        Write a Locked Week Menu note from the planning-session skill's JSON
                        ({weekStart, novelSource, days: [7 × {dinner, side, novel, double: "cook"|"second"}],
                        staples: ["Skip: milk ×1"], notes: [...]}); refuses when the note is already there

plan context, basket lines and publish warn (on stderr; publish on stdout) when Obsidian isn't running on this Mac:
Obsidian Sync only syncs the Recipe Vault while it runs.
`;

class UsageError extends UserError {}

const print = (text: string) => process.stdout.write(text);
const printLines = (lines: string[]) => print(lines.map((line) => line + "\n").join(""));
const printJson = (value: unknown) => print(JSON.stringify(value, null, 2) + "\n");

const now = () => (process.env.FOOD_NOW ? new Date(process.env.FOOD_NOW) : new Date());

async function vaultPath(): Promise<string> {
  const { vault } = await readConfig();
  if (!vault) throw new UsageError("No Recipe Vault set. Run `food config vault <path>` first.");
  return vault;
}

/** On stderr, so the JSON on stdout stays whole. */
async function warnWithoutObsidian(): Promise<void> {
  const warning = await obsidianWarning(await readConfig());
  if (warning) process.stderr.write(warning + "\n");
}

async function main(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  switch (command) {
    case "config": {
      const [key, value] = rest;
      if (key === undefined) {
        printJson(await readConfig());
        return;
      }
      if (key !== "vault" || !value) throw new UsageError(usage);
      await writeConfig({ ...(await readConfig()), vault: path.resolve(value) });
      return;
    }
    case "vault": {
      const [sub, ...flags] = rest;
      if (sub !== "check") throw new UsageError(usage);
      const { values } = parseArgs({
        args: flags,
        options: { published: { type: "boolean", default: false }, json: { type: "boolean", default: false } },
      });
      const check = await checkVault(await vaultPath(), { publishing: values.published ? now() : undefined });
      if (values.json) printJson(check);
      else print(formatCheck(check));
      if (check.errors.length > 0) process.exitCode = 1;
      return;
    }
    case "publish":
      if (!(await publish(await vaultPath(), now(), (line) => printLines([line])))) process.exitCode = 1;
      return;
    case "ah":
      return ah(rest);
    case "basket":
      return basket(rest);
    case "notes":
      return notes(rest);
    case "recipe":
      return recipe(rest);
    case "plan":
      return plan(rest);
    case "products":
      return products(rest);
    default:
      throw new UsageError(usage);
  }
}

async function products(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  if (command !== "pin" || rest.length !== 1) throw new UsageError(usage);
  const pins = await readJsonFile(rest[0], "a JSON list of pins");
  if (!Array.isArray(pins)) throw new PinInputError(`${rest[0]}: expected a JSON list of pins`);
  printLines(await pinProducts(await vaultPath(), pins as PinnedProduct[]));
}

async function plan(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  switch (command) {
    case "context":
      if (rest.length > 0) throw new UsageError(usage);
      await warnWithoutObsidian();
      printJson(await planContext(await vaultPath(), now()));
      return;
    case "sites":
      if (rest.length > 0) throw new UsageError(usage);
      printJson(await siteTrackRecord(await vaultPath()));
      return;
    case "verdict": {
      const [week, ...verdict] = rest;
      if (!week || verdict.length === 0) throw new UsageError(usage);
      printLines(await recordVerdict(await vaultPath(), week, verdict.join(" ")));
      return;
    }
    case "write": {
      if (rest.length !== 1) throw new UsageError(usage);
      const weekMenu = (await readJsonFile(rest[0], "a JSON Week Menu")) as LockedWeekMenu;
      printLines([`Wrote ${await writeWeekMenu(await vaultPath(), weekMenu)}`]);
      return;
    }
    default:
      throw new UsageError(usage);
  }
}

async function notes(args: string[]): Promise<void> {
  const [note, ...rest] = args;
  const family = familyNotes(await readConfig());
  const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { json: { type: "boolean", default: false } } });
  const [action, ...items] = positionals;
  const report = (name: string, deletion: Deletion) => {
    if (values.json) printJson(deletion);
    else printLines(formatDeletion(name, deletion));
    // 2: Notes wouldn't take the change; the skills fall back to reading only and list `deleteByHand` for an adult.
    if (deletion.deleteByHand.length > 0) process.exitCode = 2;
  };
  switch (note) {
    case "wishes": {
      if (action === "delete" && items.length > 0) return report(FOOD_WISHES, await family.deleteWishes(items));
      if (action !== undefined) throw new UsageError(usage);
      const wishes = await family.wishes();
      if (values.json) printJson(wishes);
      else printLines(wishes);
      return;
    }
    case "recipes-to-add": {
      if (action === "remove" && items.length > 0) return report(RECIPES_TO_ADD, await family.removeRecipesToAdd(items));
      if (action !== undefined) throw new UsageError(usage);
      const recipes = await family.recipesToAdd();
      if (values.json) printJson(recipes);
      else printLines(recipes.map((item) => item + "\n"));
      return;
    }
    default:
      throw new UsageError(usage);
  }
}

function formatDeletion(note: string, { deleted, notFound, deleteByHand, error }: Deletion): string[] {
  const lines = [
    ...deleted.map((item) => `Deleted from ${note}: ${item}`),
    ...notFound.map((item) => `Not in ${note}: ${item}`),
  ];
  if (deleteByHand.length > 0) {
    lines.push(`Could not change the Apple Note "${note}": ${error}`, `Please delete these from "${note}" by hand:`);
    lines.push(...deleteByHand.map((item) => `- ${item.replace(/\n/g, "\n  ")}`));
  }
  return lines;
}

async function recipe(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  switch (command) {
    case "published": {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { json: { type: "boolean", default: false } } });
      if (positionals.length !== 1) throw new UsageError(usage);
      const [name] = positionals;
      const weekMenus = await publishedWeekMenusWith(await vaultPath(), name, now());
      if (values.json) print(JSON.stringify({ recipe: name, weekMenus }) + "\n");
      else if (weekMenus.length === 0) printLines([`${name} isn't on a published Week Menu: no Publish needed.`]);
      else {
        const menus = weekMenus.length === 1 ? `Week Menu of ${weekMenus[0]}` : `Week Menus of ${weekMenus.join(", ")}`;
        printLines([`${name} is on the published ${menus}: run \`food publish\`.`]);
      }
      return;
    }
    case "delete": {
      if (rest.length !== 1) throw new UsageError(usage);
      printLines(await deleteRecipe(await vaultPath(), rest[0]));
      return;
    }
    case "fetch": {
      if (rest.length !== 1) throw new UsageError(usage);
      if (!/^https?:$/.test(URL.parse(rest[0])?.protocol ?? "")) throw new UsageError(`Not a web address: "${rest[0]}"`);
      const allerhande = allerhandeRecipeId(rest[0]);
      try {
        const page = allerhande === null ? await fetchRecipePage(rest[0]) : await ahGateway(await readConfig()).allerhandeRecipe(allerhande);
        printJson(page);
      } catch (error) {
        if (!(error instanceof RecipePageRefused || error instanceof RecipePageError)) throw error;
        process.stderr.write(error.message + "\n");
        // 2: never read this page, by any means, so ask for the recipe text. 3: no recipe data, so read the page another way.
        process.exitCode = error instanceof RecipePageRefused ? 2 : 3;
      }
      return;
    }
    default:
      throw new UsageError(usage);
  }
}

async function ah(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  const gateway = ahGateway(await readConfig());
  switch (command) {
    case "login":
      await gateway.login();
      printLines(["Logged in to AH."]);
      return;
    case "refresh":
      await gateway.refreshLogin();
      printLines(["AH login renewed."]);
      return;
    case "search": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { need: { type: "string" } },
      });
      if (positionals.length === 0) throw new UsageError(usage);
      const need = values.need === undefined ? undefined : parseMeasure(values.need);
      if (need === null) {
        throw new UsageError(`--need must be an amount such as 400g, 1.5l or 3 (pieces), not "${values.need}"`);
      }
      printJson(await gateway.searchProducts(positionals.join(" "), { need }));
      return;
    }
    case "bought": {
      if (rest.length === 0) throw new UsageError(usage);
      printJson(await gateway.searchPreviouslyBought(rest.join(" ")));
      return;
    }
    case "basket":
      printJson(await gateway.readBasket());
      return;
    case "recipes": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { season: { type: "string" }, cuisine: { type: "string" }, size: { type: "string" } },
      });
      const size = values.size === undefined ? undefined : Number(values.size);
      if (size !== undefined && !(Number.isInteger(size) && size > 0)) throw new UsageError(`--size must be a whole number, not "${values.size}"`);
      printJson(await gateway.searchAllerhande({ text: positionals.join(" ") || undefined, season: values.season, cuisine: values.cuisine, size }));
      return;
    }
    case "suggestions": {
      const id = rest.length === 1 ? allerhandeRecipeId(rest[0]) : null;
      if (id === null) throw new UsageError(`Give one Allerhande recipe address (https://www.ah.nl/allerhande/recept/R-R<number>/…).`);
      printJson(await gateway.allerhandeSuggestions(id));
      return;
    }
    default:
      throw new UsageError(usage);
  }
}

async function basket(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  if (command === "lines") {
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { week: { type: "string" } } });
    if (positionals.length !== 0 || !values.week) throw new UsageError(usage);
    await warnWithoutObsidian();
    printJson(await listBasketLines(await vaultPath(), values.week));
    return;
  }
  if (command === "remove") return removeFromBasket(rest);
  if (command !== "fill") throw new UsageError(usage);
  const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { week: { type: "string" } } });
  if (positionals.length !== 1 || !values.week) throw new UsageError(usage);
  const plan = await planBasket(await vaultPath(), values.week, await readBasketInput(positionals[0]));
  const outcome = await fillBasket(plan, ahGateway(await readConfig()), (line) => printLines([line]));
  await writeBasketSection(outcome);
  print(formatReport(outcome));
  process.exitCode = exitCode(outcome);
}

async function removeFromBasket(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { product: { type: "string", multiple: true }, note: { type: "string", multiple: true } },
  });
  const picked = (values.product ?? []).map((value) => {
    const match = value.match(/^(\d+)(?::(\d+))?$/);
    if (!match || match[2] === "0") throw new UsageError(`--product takes a webshop id, optionally with packs (12345 or 12345:2), not "${value}"`);
    return { id: Number(match[1]), packs: match[2] === undefined ? null : Number(match[2]) };
  });
  const notes = values.note ?? [];
  if (positionals.length || (!picked.length && !notes.length)) throw new UsageError(usage);

  const gateway = ahGateway(await readConfig());
  const before = await gateway.readBasket();
  const products = picked.flatMap(({ id, packs }) => {
    const line = before.products.find((p) => p.id === id);
    return line ? [{ id, title: line.title, quantity: Math.min(packs ?? line.quantity, line.quantity) }] : [];
  });
  const removedNotes = notes.filter((note) => before.notes.some((n) => n.description === note));
  if (products.length || removedNotes.length) {
    await gateway.removeFromBasket({
      products: products.map(({ id, quantity }) => ({ id, quantity })),
      notes: removedNotes.map((description) => ({ description })),
    });
  }
  const removed = [...products.map((p) => `- ${p.quantity} × ${p.title}`), ...removedNotes.map((note) => `- Note: ${note}`)];
  const missing = [
    ...picked.filter(({ id }) => !products.some((p) => p.id === id)).map(({ id }) => `- id ${id}`),
    ...notes.filter((note) => !removedNotes.includes(note)).map((note) => `- Note: ${note}`),
  ];
  printLines([
    ...(removed.length ? ["Removed from Mijn lijst:", ...removed] : ["Removed from Mijn lijst: none"]),
    ...(missing.length ? ["Not in Mijn lijst:", ...missing] : []),
  ]);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(error instanceof UserError ? error.message.trimEnd() + "\n" : `${error.stack ?? error}\n`);
  process.exitCode = 1;
});
