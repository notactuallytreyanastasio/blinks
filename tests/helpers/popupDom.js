import { readExtensionText } from "./loadScript.js";

// Loads the real popup.html and mounts its <body> content into the current
// jsdom document, stripping the <script> tags (config.js / popup.js are
// loaded separately by the test via loadExtensionScript so we can control
// globals first). popup.js grabs elements by id at top-level `const els =
// {...}`, so the DOM must exist before popup.js is evaluated.
export function mountPopupDom() {
  const html = readExtensionText("popup.html");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script").forEach((s) => s.remove());
  document.body.innerHTML = parsed.body.innerHTML;
}
