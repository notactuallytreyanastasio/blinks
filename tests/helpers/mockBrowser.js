import { vi } from "vitest";

// Fresh browser.* mock surface matching what popup.js / bsky.js /
// background.js touch: tabs.query, tabs.create, storage.local.get/set,
// scripting.executeScript, runtime.sendMessage, runtime.onMessage.addListener.
export function makeBrowserMock({
  tab = {},
  storage = {},
  executeScriptResult = "",
  sendMessageImpl,
} = {}) {
  return {
    tabs: {
      query: vi.fn(async () => [
        { id: 1, url: "https://example.com/article", title: "Example Title", ...tab },
      ]),
      create: vi.fn(async () => {}),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({ ...storage })),
        set: vi.fn(async () => {}),
      },
    },
    scripting: {
      executeScript: vi.fn(async () => [{ result: executeScriptResult }]),
    },
    runtime: {
      sendMessage: sendMessageImpl ? vi.fn(sendMessageImpl) : vi.fn(),
      onMessage: {
        addListener: vi.fn(),
      },
    },
  };
}
