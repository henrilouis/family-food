#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { AhError, ahGateway, parseAmount } from "./adapters/ah/gateway.ts";
import { buildBundle } from "./build-bundle.ts";
import { readConfig, writeConfig } from "./config.ts";
import { preview } from "./preview.ts";
import { VaultError } from "./vault.ts";

const usage = `Usage: food <command>

Commands:
  config vault <path>   Set the Recipe Vault path in the local config
  config                Show the local config
  bundle                Print the display bundle as JSON
  preview [--port <n>] [--lan]
                        Serve the Kitchen Display page and a fresh bundle on this Mac
                        (port 8787 by default; --lan to open it on other devices too)
  ah login              Log in to Albert Heijn in your browser (once; the token stays on this Mac)
  ah refresh            Renew the AH login now (says so when you need to log in again)
  ah search <query> [--need <amount>]
                        Search AH products, cleaned up and cheapest per kg, l or piece first (JSON);
                        --need (e.g. 400g, 1.5l, 3 for pieces) drops packs that would waste too much
  ah bought <query>     Search the products the household bought before, most often bought first (JSON)
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
    case "ah":
      return ah(rest);
    default:
      throw new UsageError(usage);
  }
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
  const expected = error instanceof UsageError || error instanceof VaultError || error instanceof AhError;
  process.stderr.write(expected ? error.message.trimEnd() + "\n" : `${error.stack ?? error}\n`);
  process.exitCode = 1;
});
