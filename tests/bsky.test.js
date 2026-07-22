import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadExtensionScript } from "./helpers/loadScript.js";
import { makeBrowserMock } from "./helpers/mockBrowser.js";
import { microtaskFlush } from "./helpers/flush.js";

const CONFIG = { server: "https://blinks.test", token: "test-token" };

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body });
}

function mountFeedFixture() {
  document.body.innerHTML = `
    <div data-testid="feedItem-1">
      <a href="/profile/alice.bsky.social/post/abc123">permalink</a>
      <div data-testid="postText">Hello from bluesky</div>
      <div class="bar-wrap">
        <div class="bar"><div data-testid="likeBtn">like</div></div>
      </div>
    </div>
  `;
}

function makeFetchMock(overrides = {}) {
  return vi.fn((url, opts = {}) => {
    if (typeof url === "string" && url.includes("/api/blinks/tags")) {
      return overrides.tags ? overrides.tags(url, opts) : jsonResponse({ tags: [] });
    }
    if (typeof url === "string" && url.endsWith("/api/blinks")) {
      return overrides.save ? overrides.save(url, opts) : jsonResponse({ ok: true });
    }
    return jsonResponse({});
  });
}

function loadBsky({ browserOpts = {}, fetchOverrides = {}, config = CONFIG } = {}) {
  const browserMock = makeBrowserMock(browserOpts);
  const fetchMock = makeFetchMock(fetchOverrides);
  globalThis.browser = browserMock;
  globalThis.fetch = fetchMock;
  globalThis.BLINKS_CONFIG = config;
  loadExtensionScript("bsky.js");
  return { browserMock, fetchMock };
}

function saveButtons() {
  return document.querySelectorAll("[data-blinks-btn]");
}

function clickSaveButton() {
  document.querySelector('[title="Save to blinks (v2)"]').click();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.innerHTML = "";
  delete globalThis.browser;
  delete globalThis.fetch;
  delete globalThis.BLINKS_CONFIG;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("bsky.js", () => {
  it("scan() injects exactly one save button into the fixture post", () => {
    mountFeedFixture();
    loadBsky();
    expect(saveButtons().length).toBe(1);
  });

  it("does not inject a duplicate button when the observer re-scans", async () => {
    mountFeedFixture();
    loadBsky();
    expect(saveButtons().length).toBe(1);

    // trigger the MutationObserver with an unrelated DOM change
    document.body.appendChild(document.createElement("span"));
    await microtaskFlush();
    await vi.advanceTimersByTimeAsync(500); // past the 400ms debounce

    expect(saveButtons().length).toBe(1);
  });

  it("opens a panel on document.body with a bluesky chip preselected when the button is clicked", async () => {
    mountFeedFixture();
    loadBsky({ fetchOverrides: { tags: () => jsonResponse({ tags: [] }) } });

    clickSaveButton();

    const panel = document.querySelector("[data-blinks-panel]");
    expect(panel).toBeTruthy();
    expect(panel.parentElement).toBe(document.body);

    const selChip = panel.querySelector("[data-sel] button");
    expect(selChip).toBeTruthy();
    expect(selChip.textContent).toBe("bluesky");

    await vi.advanceTimersByTimeAsync(0); // let fetchTags() settle
  });

  it("sends a runtime message with the right url/title/tags when saving", async () => {
    mountFeedFixture();
    const { browserMock } = loadBsky({
      browserOpts: {
        sendMessageImpl: (msg, cb) => cb({ ok: true }),
      },
      fetchOverrides: { tags: () => jsonResponse({ tags: [] }) },
    });

    clickSaveButton();
    await microtaskFlush();

    const panel = document.querySelector("[data-blinks-panel]");
    const input = panel.querySelector("[data-in]");
    input.value = "extra";
    input.dispatchEvent(new Event("input"));

    panel.querySelector("[data-save]").click();
    await microtaskFlush();

    expect(browserMock.runtime.sendMessage).toHaveBeenCalled();
    const [msg] = browserMock.runtime.sendMessage.mock.calls[0];
    expect(msg.type).toBe("blinks-save");
    expect(msg.url).toBe("https://bsky.app/profile/alice.bsky.social/post/abc123");
    expect(msg.title).toBe("Hello from bluesky");
    expect(msg.tags.sort()).toEqual(["bluesky", "extra"].sort());

    expect(panel.querySelector("[data-save]").textContent).toBe("Saved ✓");

    await vi.advanceTimersByTimeAsync(750); // panel auto-closes 700ms after success
    expect(document.querySelector("[data-blinks-panel]")).toBeNull();
  });

  it("falls back to a direct fetch with Bearer auth when messaging never responds within 2s", async () => {
    mountFeedFixture();
    const { fetchMock } = loadBsky({
      browserOpts: {
        sendMessageImpl: () => {
          /* never calls back, simulating a Safari messaging failure */
        },
      },
      fetchOverrides: {
        tags: () => jsonResponse({ tags: [] }),
        save: () => jsonResponse({ ok: true }),
      },
    });

    clickSaveButton();
    await microtaskFlush();

    document.querySelector("[data-blinks-panel] [data-save]").click();

    await vi.advanceTimersByTimeAsync(2100); // past the 2s viaBackground timeout
    await microtaskFlush();

    const saveCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/blinks"));
    expect(saveCall).toBeTruthy();
    const [url, opts] = saveCall;
    expect(url).toBe("https://blinks.test/api/blinks");
    expect(opts.headers.authorization).toBe("Bearer test-token");
    const body = JSON.parse(opts.body);
    expect(body.url).toBe("https://bsky.app/profile/alice.bsky.social/post/abc123");
    expect(body.tags).toContain("bluesky");
  });

  it("removes the panel when Escape is pressed", async () => {
    mountFeedFixture();
    loadBsky({ fetchOverrides: { tags: () => jsonResponse({ tags: [] }) } });

    clickSaveButton();
    expect(document.querySelector("[data-blinks-panel]")).toBeTruthy();

    const input = document.querySelector("[data-blinks-panel] [data-in]");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.querySelector("[data-blinks-panel]")).toBeNull();
  });

  it("clicking a suggested tag chip moves it into the selected chips", async () => {
    mountFeedFixture();
    loadBsky({
      fetchOverrides: { tags: () => jsonResponse({ tags: [{ name: "news", count: 4 }] }) },
    });

    clickSaveButton();
    await microtaskFlush();
    await vi.advanceTimersByTimeAsync(0);

    const panel = document.querySelector("[data-blinks-panel]");
    const listChip = Array.from(panel.querySelectorAll("[data-list] button")).find((c) =>
      c.textContent.includes("news")
    );
    expect(listChip).toBeTruthy();
    listChip.click();

    const selChips = Array.from(panel.querySelectorAll("[data-sel] button")).map(
      (c) => c.textContent
    );
    expect(selChips).toContain("news");
    const stillInList = Array.from(panel.querySelectorAll("[data-list] button")).some((c) =>
      c.textContent.includes("news")
    );
    expect(stillInList).toBe(false);
  });
});
