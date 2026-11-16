import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test sees the same clock zone as the household, whatever the machine says,
    // and only the fake adapters (see `fakesOnly` in cli/config.ts).
    env: { TZ: "Europe/Amsterdam", FOOD_FAKES_ONLY: "1" },
    // Seam 1 tests run the real CLI as processes (some copy the repo into a temp git checkout), which is slow on a busy Mac.
    testTimeout: 20_000,
  },
});
