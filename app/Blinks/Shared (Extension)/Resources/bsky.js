// Injects a "save to blinks" button into bsky.app post action bars —
// next to reply/repost/like/share — on feeds and single-post views.
// Clicking opens a mini panel to set tags before saving.
(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const MARK = "data-blinks-btn";
  const cfg = typeof BLINKS_CONFIG !== "undefined" ? BLINKS_CONFIG : null;

  function itemFor(el) {
    return (
      el.closest('[data-testid^="feedItem"]') ||
      el.closest('[data-testid^="postThreadItem"]') ||
      el.closest("article")
    );
  }

  function postUrlFor(likeBtn) {
    const item = itemFor(likeBtn);
    const a = item && item.querySelector('a[href*="/post/"]');
    if (a) return new URL(a.getAttribute("href"), location.origin).href;
    // single post view: the main post's permalink is the page itself
    if (/\/profile\/[^/]+\/post\//.test(location.pathname)) return location.href;
    return null;
  }

  function postTitleFor(likeBtn) {
    const item = itemFor(likeBtn);
    const text = item && item.querySelector('[data-testid="postText"]');
    const t = (text ? text.textContent : "").trim();
    return t ? t.slice(0, 120) : document.title;
  }

  // Save via the background worker; if messaging fails (Safari quirks),
  // fall back to fetching straight from the page with the baked config.
  function save(payload) {
    const viaBackground = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (res) => {
        if (!settled) {
          settled = true;
          res && res.ok ? resolve(res) : reject(res);
        }
      };
      try {
        const maybe = api.runtime.sendMessage({ type: "blinks-save", ...payload }, finish);
        if (maybe && typeof maybe.then === "function") {
          maybe.then(finish, () => finish(null));
        }
        setTimeout(() => finish(null), 2000);
      } catch (e) {
        finish(null);
      }
    });

    return viaBackground.catch(() => {
      if (!cfg || !cfg.token) throw new Error("no config");
      return fetch(cfg.server.replace(/\/+$/, "") + "/api/blinks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + cfg.token,
        },
        body: JSON.stringify({
          url: payload.url,
          title: payload.title,
          tags: payload.tags,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error("http " + r.status);
        return { ok: true };
      });
    });
  }

  function openPanel(btn, likeBtn) {
    const existing = btn.parentElement.querySelector("[data-blinks-panel]");
    if (existing) {
      existing.remove();
      return;
    }

    const url = postUrlFor(likeBtn);
    if (!url) return;

    const panel = document.createElement("div");
    panel.setAttribute("data-blinks-panel", "1");
    panel.style.cssText =
      "position:absolute;z-index:9999;background:#fff;border:1px solid #c8d1dc;" +
      "border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,0.18);padding:8px;" +
      "display:flex;gap:6px;align-items:center;margin-top:4px;";

    const input = document.createElement("input");
    input.type = "text";
    input.value = "bluesky";
    input.placeholder = "tags, comma separated";
    input.style.cssText =
      "font:13px -apple-system,sans-serif;border:1px solid #c8d1dc;border-radius:6px;" +
      "padding:4px 8px;width:180px;color:#000;background:#fff;";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "save";
    saveBtn.style.cssText =
      "font:bold 12px -apple-system,sans-serif;background:#ff4500;color:#fff;" +
      "border:none;border-radius:6px;padding:5px 12px;cursor:pointer;";

    const doSave = () => {
      saveBtn.textContent = "…";
      const tags = input.value.split(",").map((t) => t.trim()).filter(Boolean);
      save({ url, title: postTitleFor(likeBtn), tags })
        .then(() => {
          saveBtn.textContent = "✓";
          btn.textContent = "✓";
          btn.style.color = "#ff4500";
          setTimeout(() => panel.remove(), 600);
        })
        .catch(() => {
          saveBtn.textContent = "retry";
          btn.textContent = "!";
          btn.style.color = "#c00";
        });
    };

    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      doSave();
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") doSave();
      if (e.key === "Escape") panel.remove();
    });
    input.addEventListener("click", (e) => e.stopPropagation());

    btn.parentElement.style.position = "relative";
    panel.appendChild(input);
    panel.appendChild(saveBtn);
    btn.parentElement.appendChild(panel);
    input.focus();
    input.select();
  }

  function makeButton(likeBtn) {
    const wrap = document.createElement("div");
    wrap.setAttribute(MARK, "1");
    wrap.style.cssText = "display:inline-flex;position:relative;";

    const btn = document.createElement("div");
    btn.title = "Save to blinks (v2)";
    btn.textContent = "🅱";
    btn.style.cssText =
      "display:inline-flex;align-items:center;justify-content:center;" +
      "cursor:pointer;font-size:15px;line-height:1;padding:5px;" +
      "color:#788aa5;user-select:none;opacity:0.75;";
    btn.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = "0.75"));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel(btn, likeBtn);
    });

    wrap.appendChild(btn);
    return wrap;
  }

  function scan() {
    document.querySelectorAll('[data-testid="likeBtn"]').forEach((likeBtn) => {
      const bar = likeBtn.parentElement;
      if (!bar || bar.parentElement.querySelector(`[${MARK}]`)) return;
      bar.insertAdjacentElement("afterend", makeButton(likeBtn));
    });
  }

  let pending = null;
  new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      scan();
    }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });

  scan();
})();
