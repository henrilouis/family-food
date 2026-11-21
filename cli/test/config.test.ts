import { describe, expect, test } from "vitest";
import { sandbox } from "./harness.ts";

describe("food config", () => {
  test("a command that needs the Recipe Vault explains how to set it when none is configured", async () => {
    const { run } = await sandbox({ configured: false });

    const result = await run(["vault", "check"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("food config vault <path>");
  });

  test("food config shows the Recipe Vault path it was given", async () => {
    const { run, vault } = await sandbox({ configured: false });

    await run(["config", "vault", vault]);
    const result = await run(["config"]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ vault });
  });
});
