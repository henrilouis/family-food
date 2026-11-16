#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { AhError, ahGateway, parseAmount } from "./adapters/ah/gateway.ts";
import { AppleNotesError, familyNotes, FOOD_WISHES, type Deletion } from "./adapters/apple-notes/notes.ts";
import { buildBundle } from "./build-bundle.ts";
import { checkVault, formatCheck } from "./check.ts";
import { readConfig, writeConfig } from "./config.ts";
import { DisplayTargetError } from "./adapters/display-target.ts";
import { deploy, DeployRefused } from "./deploy.ts";
import { preview } from "./preview.ts";
import { publish, UNREACHABLE_MESSAGE } from "./publish.ts";
import { VaultError } from "./vault.ts";

const usage = `Usage: food <command>

Commands:
  config vault <path>   Set the Recipe Vault path in the local config
  config                Show the local config
  vault check [--published] [--json]
                        Check the Recipe Vault's format: errors (exit 1, block Publish) and warnings.
                        --published checks only the Week Menus and Recipes a Publish would send;
                        --json prints {"errors": [...], "warnings": [...]} with {file, message} items
  bundle                Print the display bundle as JSON
  preview [--port <n>] [--lan]
                        Serve the Kitchen Display page and a fresh bundle on this Mac
                        (port 8787 by default; --lan to open it on other devices too)
  publish               Send the current and upcoming Week Menus to the Kitchen Display Pi:
                        vault check (errors stop it, exit 1), bundle, new release, keep the last 3.
                        Prints "${UNREACHABLE_MESSAGE}" and exits 0 when the Pi is out of reach
  ah login              Log in to Albert Heijn in your browser (once; the token stays on this Mac)
  ah refresh            Renew the AH login now (says so when you need to log in again)
  ah search <query> [--need <amount>]
                        Search AH products, cleaned up and cheapest per kg, l or piece first (JSON);
                        --need (e.g. 400g, 1.5l, 3 for pieces) drops packs that would waste too much
  ah bought <query>     Search the products the household bought before, most often bought first (JSON)
  deploy                Set up, update or repair the Kitchen Display Pi (ssh host \`kitchen\`)
                        from a clean main that matches origin
`;

class UsageError extends Error {}

const now = () => (process.env.FOOD_NOW ? new Date(process.env.FOOD_NOW) : new Date());

async function vaultPath(): Promise<string> {
  const { vault } = await readConfig();
  if (!vault) throw new UsageError("No Recipe Vault set. Run `food config vault <path>` first.");
  return vault;
}

async function main(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  switch (command) {
    case "config": {
      const [key, value] = rest;
      if (key === undefined) {
        process.stdout.write(JSON.stringify(await readConfig(), null, 2) + "\n");
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
      process.stdout.write(values.json ? JSON.stringify(check, null, 2) + "\n" : formatCheck(check));
      if (check.errors.length > 0) process.exitCode = 1;
      return;
    }
    case "bundle": {
      const bundle = await buildBundle(await vaultPath(), now());
      process.stdout.write(JSON.stringify(bundle, null, 2) + "\n");
      return;
    }
    case "preview": {
      const { values } = parseArgs({
        args: rest,
        options: { port: { type: "string", default: "8787" }, lan: { type: "boolean", default: false } },
      });
      const port = Number(values.port);
      if (!Number.isInteger(port) || port < 0) throw new UsageError(`--port must be a port number, not "${values.port}"`);
      preview({ vault: await vaultPath(), port, lan: values.lan, now });
      return;
    }
    case "deploy":
      await deploy((line) => line && process.stdout.write(line + "\n"));
      return;
    case "publish":
      if (!(await publish(await vaultPath(), now(), (line) => process.stdout.write(line + "\n")))) process.exitCode = 1;
      return;
    case "ah":
      return ah(rest);
    case "notes":
      return notes(rest);
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
    process.stdout.write(values.json ? JSON.stringify(deletion, null, 2) + "\n" : formatDeletion(name, deletion));
    // 2: Notes wouldn't take the change; the skills fall back to reading only and list `deleteByHand` for an adult.
    if (deletion.deleteByHand.length > 0) process.exitCode = 2;
  };
  switch (note) {
    case "wishes": {
      if (action === "delete" && items.length > 0) return report(FOOD_WISHES, await family.deleteWishes(items));
      if (action !== undefined) throw new UsageError(usage);
      const wishes = await family.wishes();
      process.stdout.write(values.json ? JSON.stringify(wishes, null, 2) + "\n" : wishes.map((wish) => wish + "\n").join(""));
      return;
    }
    default:
      throw new UsageError(usage);
  }
}

function formatDeletion(note: string, { deleted, notFound, deleteByHand, error }: Deletion): string {
  const lines = [
    ...deleted.map((item) => `Deleted from ${note}: ${item}`),
    ...notFound.map((item) => `Not in ${note}: ${item}`),
  ];
  if (deleteByHand.length > 0) {
    lines.push(`Could not change the Apple Note "${note}": ${error}`, `Please delete these from "${note}" by hand:`);
    lines.push(...deleteByHand.map((item) => `- ${item.replace(/\n/g, "\n  ")}`));
  }
  return lines.map((line) => line + "\n").join("");
}

async function ah(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  const gateway = ahGateway(await readConfig());
  const print = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  switch (command) {
    case "login":
      await gateway.login();
      process.stdout.write("Logged in to AH.\n");
      return;
    case "refresh":
      await gateway.refreshLogin();
      process.stdout.write("AH login renewed.\n");
      return;
    case "search": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { need: { type: "string" } },
      });
      if (positionals.length === 0) throw new UsageError(usage);
      const need = values.need === undefined ? undefined : parseAmount(values.need);
      if (need === null) {
        throw new UsageError(`--need must be an amount such as 400g, 1.5l or 3 (pieces), not "${values.need}"`);
      }
      print(await gateway.searchProducts(positionals.join(" "), { need }));
      return;
    }
    case "bought": {
      if (rest.length === 0) throw new UsageError(usage);
      print(await gateway.searchPreviouslyBought(rest.join(" ")));
      return;
    }
    default:
      throw new UsageError(usage);
  }
}

main(process.argv.slice(2)).catch((error) => {
  const expected = [UsageError, VaultError, DeployRefused, DisplayTargetError, AhError, AppleNotesError].some((type) => error instanceof type);
  process.stderr.write(expected ? error.message.trimEnd() + "\n" : `${error.stack ?? error}\n`);
  process.exitCode = 1;
});
