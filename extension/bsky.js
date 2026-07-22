// Injects a "save to blinks" button into bsky.app post action bars —
// next to reply/repost/like/share — on feeds and single-post views.
(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const MARK = "data-blinks-btn";

  function postUrlFor(likeBtn) {
    const item =
      likeBtn.closest('[data-testid^="feedItem"]') ||
      likeBtn.closest('[data-testid^="postThreadItem"]') ||
      likeBtn.closest("article");

    const a = item && item.querySelector('a[href*="/post/"]');
    if (a) return new URL(a.getAttribute("href"), location.origin).href;
    // single post view: the main post's permalink is the page itself
    if (/\/profile\/[^/]+\/post\//.test(location.pathname)) return location.href;
    return null;
  }

  function postTitleFor(likeBtn) {
    const item =
      likeBtn.closest('[data-testid^="feedItem"]') ||
      likeBtn.closest('[data-testid^="postThreadItem"]') ||
      likeBtn.closest("article");
    const text = item && item.querySelector('[data-testid="postText"]');
    const t = (text ? text.textContent : "").trim();
    return t ? t.slice(0, 120) : document.title;
  }

  function makeButton(likeBtn) {
    const btn = document.createElement("div");
    btn.setAttribute(MARK, "1");
    btn.title = "Save to blinks";
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
      const url = postUrlFor(likeBtn);
      if (!url) return;
      btn.textContent = "…";
      api.runtime.sendMessage(
        { type: "blinks-save", url, title: postTitleFor(likeBtn) },
        (res) => {
          btn.textContent = res && res.ok ? "✓" : "!";
          btn.style.color = res && res.ok ? "#ff4500" : "#c00";
        }
      );
    });

    return btn;
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
