const test = require("node:test");
const assert = require("node:assert");

// Setup browser-like global mocks for cache-service test
function createMockStorage() {
  const store = new Map();
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    key(i) { return Array.from(store.keys())[i] || null; },
    get length() { return store.size; },
  };
}

global.window = {
  sessionStorage: createMockStorage(),
  localStorage: createMockStorage(),
  scrollY: 0,
  scrollTo() {},
  requestAnimationFrame(cb) { cb(); },
};
global.document = {
  documentElement: { scrollTop: 0 },
};

// Load cache-service.js
require("../js/cache-service.js");

test("CacheService isolates caches by user and purges on logout", () => {
  const cache = global.window.ClasheCache;
  assert.ok(cache, "ClasheCache exists on window");

  // User A logs in
  cache.setActiveUserId("user-a");
  assert.strictEqual(cache.getActiveUserId(), "user-a");

  // User A saves feed state
  cache.savePageState("home", {
    takes: [{ id: "take-1", vote: { user_vote: "agree" } }],
  }, 100, "user-a");

  // User A reads feed state
  let record = cache.getPageState("home");
  assert.ok(record, "User A gets their page state");
  assert.strictEqual(record.data.takes[0].vote.user_vote, "agree");

  // User A logs out
  cache.clearAll();

  // Cache is purged
  assert.strictEqual(cache.getPageState("home"), null);
  assert.strictEqual(cache.getActiveUserId(), "");

  // User B logs in
  cache.setActiveUserId("user-b");
  assert.strictEqual(cache.getActiveUserId(), "user-b");

  // User B attempts to read feed state before fetching
  assert.strictEqual(cache.getPageState("home"), null, "User B never sees User A's cache");

  // Even if an old record with user-a was somehow left, getPageState rejects it
  cache.savePageState("home", { takes: [{ id: "take-old", vote: { user_vote: "agree" } }] }, 0, "user-a");
  assert.strictEqual(cache.getPageState("home"), null, "Rejects cache belonging to different user");
});
