import http from "node:http";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BUNDLE_FILE, VERSION_FILE } from "../bundle/bundle.ts";
import { buildBundle } from "./build-bundle.ts";
import { bundleVersion } from "./bundle-files.ts";
import { buildPageScript, displayDir as display } from "./page.ts";

type Options = { vault: string; port: number; lan: boolean; now: () => Date };
type Route = { contentType: string; body: () => Promise<string> };

/** Serves the Kitchen Display page and a bundle (and its version file) freshly built from the Recipe Vault on every request. */
export function preview({ vault, port, lan, now }: Options): void {
  const routes: Record<string, Route> = {
    "/": { contentType: "text/html; charset=utf-8", body: () => readFile(path.join(display, "index.html"), "utf8") },
    "/style.css": { contentType: "text/css; charset=utf-8", body: () => readFile(path.join(display, "style.css"), "utf8") },
    "/page.js": { contentType: "text/javascript; charset=utf-8", body: buildPageScript },
    [`/${BUNDLE_FILE}`]: { contentType: "application/json; charset=utf-8", body: async () => JSON.stringify(await buildBundle(vault, now())) },
    [`/${VERSION_FILE}`]: {
      contentType: "application/json; charset=utf-8",
      body: async () => JSON.stringify(bundleVersion(await buildBundle(vault, now()))),
    },
  };

  const server = http.createServer(async (req, res) => {
    const route = routes[new URL(req.url ?? "/", "http://localhost").pathname];
    if (!route) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    try {
      const body = await route.body();
      res.writeHead(200, { "content-type": route.contentType, "cache-control": "no-store" }).end(body);
    } catch (error) {
      process.stderr.write(`${req.url}: ${(error as Error).message}\n`);
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(String((error as Error).message));
    }
  });

  server.listen(port, lan ? "0.0.0.0" : "localhost", () => {
    const { port } = server.address() as { port: number };
    const urls = [`http://localhost:${port}/`];
    if (lan) {
      for (const nets of Object.values(os.networkInterfaces()))
        for (const net of nets ?? []) if (net.family === "IPv4" && !net.internal) urls.push(`http://${net.address}:${port}/`);
    }
    process.stdout.write(`Kitchen Display preview (Ctrl-C to stop):\n${urls.map((u) => `  ${u}\n`).join("")}`);
  });
}
