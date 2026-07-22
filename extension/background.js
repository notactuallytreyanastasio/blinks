// Service worker: saves posts on behalf of the bsky.app content script
// (extension-origin fetch, so no CORS involvement).
importScripts("config.js");

const rt = typeof browser !== "undefined" ? browser : chrome;

rt.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "blinks-save") {
    fetch(BLINKS_CONFIG.server.replace(/\/+$/, "") + "/api/blinks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + BLINKS_CONFIG.token,
      },
      body: JSON.stringify({
        url: msg.url,
        title: msg.title,
        tags: msg.tags && msg.tags.length ? msg.tags : ["bluesky"],
      }),
    })
      .then((r) => sendResponse({ ok: r.ok }))
      .catch(() => sendResponse({ ok: false }));
    return true; // async response
  }
});
