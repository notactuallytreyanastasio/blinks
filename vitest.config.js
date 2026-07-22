import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        // bsky.js keys behavior off location.origin / location.pathname
        url: "https://bsky.app/",
      },
    },
    include: ["tests/**/*.test.js"],
    globals: false,
  },
});
