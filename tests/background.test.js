import { afterEach, describe, expect, it, vi } from "vitest";
import { loadExtensionScript } from "./helpers/loadScript.js";
import { makeBrowserMock } from "./helpers/mockBrowser.js";
import { flush } from "./helpers/flush.js";

const CONFIG = { server: "https://blinks.test", token: "test-token" };

function loadBackground({ config = CONFIG } = {}) {
  const browserMock = makeBrowserMock();
  // background.js runs `importScripts("config.js")` at top level — that API
  // only exists inside a real service worker. We stub it as a no-op and set
  // BLINKS_CONFIG directly on globalThis (what importScripts("config.js")
  // would have done in the real extension).
  const importScriptsMock = vi.fn();
  globalThis.browser = browserMock;
  globalThis.BLINKS_CONFIG = config;
  globalThis.importScripts = importScriptsMock;
  loadExtensionScript("background.js");
  return { browserMock, importScriptsMock };
}

function getListener(browserMock) {
  expect(browserMock.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  const [listener] = browserMock.runtime.onMessage.addListener.mock.calls[0];
  expect(typeof listener).toBe("function");
  return listener;
}

afterEach(() => {
  delete globalThis.browser;
  delete globalThis.fetch;
  delete globalThis.BLINKS_CONFIG;
  delete globalThis.importScripts;
  vi.restoreAllMocks();
});

describe("background.js", () => {
  it("calls importScripts('config.js') and registers the onMessage listener", () => {
    const { browserMock, importScriptsMock } = loadBackground();
    expect(importScriptsMock).toHaveBeenCalledWith("config.js");
    getListener(browserMock);
  });

  it("on a blinks-save message, POSTs with Bearer auth and defaults tags to ['bluesky'] when empty", async () => {
    const { browserMock } = loadBackground();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    globalThis.fetch = fetchMock;
    const listener = getListener(browserMock);
    const sendResponse = vi.fn();

    const result = listener(
      { type: "blinks-save", url: "https://example.com/p", title: "A post", tags: [] },
      {},
      sendResponse
    );

    expect(result).toBe(true); // signals async sendResponse to the runtime
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://blinks.test/api/blinks");
    expect(opts.method).toBe("POST");
    expect(opts.headers.authorization).toBe("Bearer test-token");
    expect(JSON.parse(opts.body)).toEqual({
      url: "https://example.com/p",
      title: "A post",
      tags: ["bluesky"],
    });
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  it("passes explicit tags through unchanged", async () => {
    const { browserMock } = loadBackground();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    globalThis.fetch = fetchMock;
    const listener = getListener(browserMock);
    const sendResponse = vi.fn();

    listener(
      { type: "blinks-save", url: "https://example.com/p", title: "A post", tags: ["custom"] },
      {},
      sendResponse
    );
    await flush();

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tags).toEqual(["custom"]);
  });

  it("sends {ok:false} when the server responds with a non-OK status", async () => {
    const { browserMock } = loadBackground();
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    const listener = getListener(browserMock);
    const sendResponse = vi.fn();

    listener({ type: "blinks-save", url: "https://x", title: "t", tags: [] }, {}, sendResponse);
    await flush();

    expect(sendResponse).toHaveBeenCalledWith({ ok: false });
  });

  it("sends {ok:false} when fetch rejects with a network error", async () => {
    const { browserMock } = loadBackground();
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    });
    const listener = getListener(browserMock);
    const sendResponse = vi.fn();

    listener({ type: "blinks-save", url: "https://x", title: "t", tags: [] }, {}, sendResponse);
    await flush();

    expect(sendResponse).toHaveBeenCalledWith({ ok: false });
  });

  it("ignores messages that are not type 'blinks-save'", async () => {
    const { browserMock } = loadBackground();
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    const listener = getListener(browserMock);
    const sendResponse = vi.fn();

    const result = listener({ type: "something-else" }, {}, sendResponse);
    await flush();

    expect(result).toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
