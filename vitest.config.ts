import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test sees the same clock zone as the household, whatever the machine says.
    env: { TZ: "Europe/Amsterdam" },
    // Seam 1 tests run the real CLI as processes (some copy the repo into a temp git checkout), which is slow on a busy Mac.
    testTimeout: 20_000,
  },
});
