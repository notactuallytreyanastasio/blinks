// popup.js's init() and bsky.js's save-path chains fire off several async
// functions without awaiting them. Tests need to let pending microtasks
// (and one macrotask turn, for the odd setTimeout(fn, 0)) drain before
// asserting on DOM/mock state.
//
// Uses a real setTimeout, so it must NOT be used while vi.useFakeTimers()
// is active (it would hang) — use microtaskFlush() there instead.
export async function flush(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Microtask-only drain, safe to use under vi.useFakeTimers().
export async function microtaskFlush(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}
