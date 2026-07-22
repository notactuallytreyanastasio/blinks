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

  // Existing tags (with counts) for the chip list — fetched once per page.
  let tagsCache = null;
  function fetchTags() {
    if (tagsCache) return Promise.resolve(tagsCache);
    if (!cfg || !cfg.token) return Promise.resolve([]);
    return fetch(cfg.server.replace(/\/+$/, "") + "/api/blinks/tags", {
      headers: { authorization: "Bearer " + cfg.token },
    })
      .then((r) => r.json())
      .then((data) => {
        tagsCache = data.tags || [];
        return tagsCache;
      })
      .catch(() => []);
  }

  // Styled like the extension popup: chips, search-or-add input, accent save.
  function openPanel(btn, likeBtn) {
    const existing = btn.parentElement.querySelector("[data-blinks-panel]");
    if (existing) {
      existing.remove();
      return;
    }

    const url = postUrlFor(likeBtn);
    if (!url) return;

    const ACCENT = "#4f46e5";
    const selected = new Set(["bluesky"]);
    let allTags = [];

    const panel = document.createElement("div");
    panel.setAttribute("data-blinks-panel", "1");
    panel.style.cssText =
      "position:absolute;top:calc(100% + 6px);right:0;z-index:99999;width:300px;" +
      "background:#fff;color:#000;border:1px solid #d5dbe3;border-radius:12px;" +
      "box-shadow:0 8px 28px rgba(0,0,0,0.22);padding:10px;text-align:left;" +
      "font:13px -apple-system,system-ui,sans-serif;cursor:default;";
    panel.addEventListener("click", (e) => e.stopPropagation());

    panel.innerHTML =
      '<div style="font-weight:600;margin-bottom:6px;">save to <span style="color:#ff4500;">blinks</span></div>' +
      '<div data-sel style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;"></div>' +
      '<input data-in type="text" placeholder="search tags, or new ones: a, b, c" autocapitalize="none" ' +
      'style="width:100%;box-sizing:border-box;font:13px -apple-system,sans-serif;border:1px solid #c8d1dc;' +
      'border-radius:8px;padding:6px 8px;color:#000;background:#fff;outline-color:' + ACCENT + ';">' +
      '<div data-list style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;max-height:96px;overflow-y:auto;"></div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:8px;">' +
      '<button data-save style="font:600 13px -apple-system,sans-serif;background:' + ACCENT + ';color:#fff;' +
      'border:none;border-radius:8px;padding:6px 16px;cursor:pointer;">Save</button></div>';

    const input = panel.querySelector("[data-in]");
    const selDiv = panel.querySelector("[data-sel]");
    const listDiv = panel.querySelector("[data-list]");
    const saveBtn = panel.querySelector("[data-save]");

    const chipCss =
      "border:none;border-radius:999px;padding:3px 10px;font:12px -apple-system,sans-serif;" +
      "cursor:pointer;background:rgba(127,127,127,0.14);color:#222;";

    function typedTags() {
      return input.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    }

    function filterFragment() {
      const parts = input.value.split(",");
      return parts[parts.length - 1].trim().toLowerCase();
    }

    function renderChips() {
      selDiv.innerHTML = "";
      selected.forEach((tag) => {
        const chip = document.createElement("button");
        chip.style.cssText = chipCss + "background:" + ACCENT + ";color:#fff;";
        chip.textContent = tag;
        chip.onclick = (e) => {
          e.stopPropagation();
          selected.delete(tag);
          renderChips();
        };
        selDiv.appendChild(chip);
      });

      const frag = filterFragment();
      listDiv.innerHTML = "";
      allTags
        .filter((t) => !selected.has(t.name))
        .filter((t) => !frag || t.name.includes(frag))
        .slice(0, 20)
        .forEach((t) => {
          const chip = document.createElement("button");
          chip.style.cssText = chipCss;
          chip.textContent = t.name;
          const n = document.createElement("span");
          n.textContent = " " + t.count;
          n.style.cssText = "opacity:0.5;font-size:10px;";
          chip.appendChild(n);
          chip.onclick = (e) => {
            e.stopPropagation();
            selected.add(t.name);
            const parts = input.value.split(",");
            parts.pop();
            input.value = parts.length ? parts.join(",") + ", " : "";
            renderChips();
            input.focus();
          };
          listDiv.appendChild(chip);
        });
    }

    const doSave = () => {
      saveBtn.textContent = "…";
      const tags = [...selected, ...typedTags()];
      save({ url, title: postTitleFor(likeBtn), tags })
        .then(() => {
          saveBtn.textContent = "Saved ✓";
          btn.textContent = "✓";
          btn.style.color = "#ff4500";
          setTimeout(() => panel.remove(), 700);
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
    input.addEventListener("input", renderChips);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") doSave();
      if (e.key === "Escape") panel.remove();
    });

    btn.parentElement.appendChild(panel);
    renderChips();
    fetchTags().then((tags) => {
      allTags = tags;
      renderChips();
    });
    input.focus();
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
