// Reads a real extension script from ../../extension and executes it in the
// current (jsdom) global scope. We deliberately do NOT copy or transform the
// source — these are plain, non-module browser scripts, and the whole point
// of the harness is to exercise the shipped files as-is.
//
// `new Function(code)` compiles the source as a function whose free
// variables (document, window, fetch, browser, BLINKS_CONFIG, setTimeout,
// MutationObserver, importScripts, ...) resolve through the global scope at
// call time. Tests set up any mocks/globals the script expects (via
// globalThis.foo = ...) *before* calling loadExtensionScript, exactly as a
// real browser would provide `browser`/`chrome`/`fetch`/`BLINKS_CONFIG`
// ambiently before the script runs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXT_DIR = path.resolve(__dirname, "../../extension");

const cache = new Map();

function readExtensionFile(filename) {
  if (!cache.has(filename)) {
    cache.set(filename, fs.readFileSync(path.join(EXT_DIR, filename), "utf8"));
  }
  return cache.get(filename);
}

export function loadExtensionScript(filename) {
  const code = readExtensionFile(filename);
  const fn = new Function(code);
  return fn();
}

export function readExtensionText(filename) {
  return readExtensionFile(filename);
}
