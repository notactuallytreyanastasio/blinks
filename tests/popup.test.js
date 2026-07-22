import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadExtensionScript } from "./helpers/loadScript.js";
import { mountPopupDom } from "./helpers/popupDom.js";
import { makeBrowserMock } from "./helpers/mockBrowser.js";
import { flush } from "./helpers/flush.js";

const CONFIG = { server: "https://blinks.test", token: "test-token" };

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body });
}

// Default fetch mock: tags endpoint returns a couple of tags, lookup
// endpoint reports nothing saved yet, POST save succeeds. Individual tests
// override pieces of this via `overrides`.
function makeFetchMock(overrides = {}) {
  return vi.fn((url, opts = {}) => {
    if (typeof url === "string" && url.includes("/api/blinks/tags")) {
      return overrides.tags ? overrides.tags(url, opts) : jsonResponse({ tags: [{ name: "existingtag", count: 4 }] });
    }
    if (typeof url === "string" && url.includes("/api/blinks/lookup")) {
      return overrides.lookup ? overrides.lookup(url, opts) : jsonResponse({ blink: null });
    }
    if (typeof url === "string" && url.endsWith("/api/blinks")) {
      return overrides.save ? overrides.save(url, opts) : jsonResponse({ ok: true });
    }
    return jsonResponse({});
  });
}

function setup({ browserOpts = {}, fetchOverrides = {}, config = CONFIG } = {}) {
  mountPopupDom();
  const browserMock = makeBrowserMock(browserOpts);
  const fetchMock = makeFetchMock(fetchOverrides);
  globalThis.browser = browserMock;
  globalThis.fetch = fetchMock;
  globalThis.BLINKS_CONFIG = config;
  loadExtensionScript("popup.js");
  return { browserMock, fetchMock };
}

function el(id) {
  return document.getElementById(id);
}

afterEach(() => {
  document.body.innerHTML = "";
  delete globalThis.browser;
  delete globalThis.fetch;
  delete globalThis.BLINKS_CONFIG;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("popup.js", () => {
  it("populates the title input and url line from the active tab on init", async () => {
    setup({ browserOpts: { tab: { title: "Hello World", url: "https://example.com/a" } } });
    await flush();

    expect(el("page-title").value).toBe("Hello World");
    expect(el("page-url").textContent).toBe("https://example.com/a");
  });

  it("renders cached tags from storage immediately, before the network responds", async () => {
    let resolveTags;
    const tagsPromise = new Promise((resolve) => {
      resolveTags = resolve;
    });
    setup({
      browserOpts: { storage: { cachedTags: [{ name: "cachedtag", count: 2 }] } },
      fetchOverrides: { tags: () => tagsPromise },
    });
    await flush();

    const listText = el("tag-list").textContent;
    expect(listText).toContain("cachedtag");

    // clean up the still-pending promise
    resolveTags(jsonResponse({ tags: [] }));
    await flush();
  });

  it("replaces cached tags with freshly fetched tags once the request resolves", async () => {
    let resolveTags;
    const tagsPromise = new Promise((resolve) => {
      resolveTags = resolve;
    });
    setup({
      browserOpts: { storage: { cachedTags: [{ name: "cachedtag", count: 2 }] } },
      fetchOverrides: { tags: () => tagsPromise },
    });
    await flush();
    expect(el("tag-list").textContent).toContain("cachedtag");

    resolveTags(jsonResponse({ tags: [{ name: "freshtag", count: 9 }] }));
    await flush();

    expect(el("tag-list").textContent).toContain("freshtag");
    expect(el("tag-list").textContent).not.toContain("cachedtag");
  });

  it("POSTs typed + selected tags to {server}/api/blinks on Save, with null description and no quotes", async () => {
    const { fetchMock } = setup({
      browserOpts: { tab: { title: "My Title", url: "https://example.com/x" } },
    });
    await flush();

    // select the one existing chip fetched from the server
    const existingChip = Array.from(el("tag-list").children).find((c) =>
      c.textContent.includes("existingtag")
    );
    expect(existingChip).toBeTruthy();
    existingChip.click();

    el("tag-input").value = "a, b";
    el("tag-input").dispatchEvent(new Event("input"));

    el("save-btn").click();
    await flush();

    const saveCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/blinks"));
    expect(saveCall).toBeTruthy();
    const [url, opts] = saveCall;
    expect(url).toBe("https://blinks.test/api/blinks");
    expect(opts.method).toBe("POST");
    expect(opts.headers["x-blinks-token"]).toBe("test-token");

    const body = JSON.parse(opts.body);
    expect(body.url).toBe("https://example.com/x");
    expect(body.title).toBe("My Title");
    expect(body.description).toBeNull();
    expect(body.quotes).toEqual([]);
    expect(body.tags.sort()).toEqual(["a", "b", "existingtag"].sort());

    expect(el("status").textContent).toBe("Saved ✓");
    expect(el("status").className).toContain("ok");
  });

  it("shows the quote row and includes the captured selection in the save payload", async () => {
    const { fetchMock } = setup({
      browserOpts: { executeScriptResult: "a very important quote" },
    });
    await flush();

    expect(el("quote-row").hidden).toBe(false);
    expect(el("quote-text").textContent).toContain("a very important quote");

    el("save-btn").click();
    await flush();

    const saveCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/blinks"));
    const body = JSON.parse(saveCall[1].body);
    expect(body.quotes).toEqual(["a very important quote"]);
  });

  it("clears the quote when the quote ✕ is clicked, and omits it from the next save", async () => {
    const { fetchMock } = setup({
      browserOpts: { executeScriptResult: "quote to discard" },
    });
    await flush();
    expect(el("quote-row").hidden).toBe(false);

    el("quote-x").click();
    expect(el("quote-row").hidden).toBe(true);

    el("save-btn").click();
    await flush();

    const saveCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/blinks"));
    const body = JSON.parse(saveCall[1].body);
    expect(body.quotes).toEqual([]);
  });

  it("checkExisting prefills tags/title/description and shows the already-saved status", async () => {
    setup({
      fetchOverrides: {
        lookup: () =>
          jsonResponse({
            blink: {
              tags: ["foo", "bar"],
              title: "Existing Title",
              description: "Existing description",
            },
          }),
      },
    });
    await flush();

    expect(el("page-title").value).toBe("Existing Title");
    expect(el("desc-input").value).toBe("Existing description");
    const selectedText = el("selected-tags").textContent;
    expect(selectedText).toContain("foo");
    expect(selectedText).toContain("bar");
    expect(el("status").textContent).toBe("Already saved — saving again updates it.");
    expect(el("status").className).toContain("ok");
  });

  it("clicking a chip in the tag list moves it into the selected chips", async () => {
    setup();
    await flush();

    expect(el("selected-tags").textContent).not.toContain("existingtag");
    const chip = Array.from(el("tag-list").children).find((c) =>
      c.textContent.includes("existingtag")
    );
    chip.click();

    expect(el("selected-tags").textContent).toContain("existingtag");
    const stillInList = Array.from(el("tag-list").children).some((c) =>
      c.textContent.includes("existingtag")
    );
    expect(stillInList).toBe(false);
  });

  it('shows "Save failed" and re-enables the Save button when the save request fails', async () => {
    setup({
      fetchOverrides: {
        save: () => jsonResponse({}, false),
      },
    });
    await flush();

    el("save-btn").click();
    await flush();

    expect(el("status").textContent).toContain("Save failed");
    expect(el("status").className).toContain("err");
    expect(el("save-btn").disabled).toBe(false);
  });

  it("pressing Enter in the tag input triggers Save", async () => {
    const { fetchMock } = setup();
    await flush();

    el("tag-input").value = "enterkey";
    el("tag-input").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await flush();

    const saveCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/blinks"));
    expect(saveCall).toBeTruthy();
    expect(JSON.parse(saveCall[1].body).tags).toContain("enterkey");
  });

  it("archive button opens web.archive.org and archive.ph tabs in the background", async () => {
    const { browserMock } = setup({
      browserOpts: { tab: { url: "https://example.com/x" } },
    });
    await flush();

    el("archive-btn").click();

    expect(browserMock.tabs.create).toHaveBeenCalledTimes(2);
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: "https://web.archive.org/save/https://example.com/x",
      active: false,
    });
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: "https://archive.ph/?url=" + encodeURIComponent("https://example.com/x"),
      active: false,
    });
    expect(el("status").textContent).toBe("Archiving opened in background tabs ✓");
  });
});
