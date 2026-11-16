import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test sees the same clock zone as the household, whatever the machine says.
    env: { TZ: "Europe/Amsterdam" },
  },
});
