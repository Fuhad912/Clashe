const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

test("permission starts in the click call and subscriptions can be enabled and disabled", async () => {
  const requests = [];
  let permissionRequests = 0;
  let subscription = null;
  const registration = {
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: async () => {
        subscription = {
          endpoint: "https://push.example/device",
          toJSON: () => ({ endpoint: "https://push.example/device", keys: { p256dh: "key", auth: "secret" } }),
          unsubscribe: async () => { subscription = null; return true; },
        };
        return subscription;
      },
    },
  };
  const notification = {
    permission: "default",
    requestPermission: () => {
      permissionRequests += 1;
      notification.permission = "granted";
      return Promise.resolve("granted");
    },
  };
  const win = {
    isSecureContext: true,
    PushManager: function () {},
    Notification: notification,
    ClashlySupabase: {
      getClient: () => ({ functions: { invoke: async (_name, options) => {
        requests.push(options);
        if (options.method === "GET") return { data: { configured: true, publicKey: "AQID" }, error: null };
        return { data: {}, error: null };
      } } }),
    },
    addEventListener() {},
    dispatchEvent() {},
    setTimeout,
    clearTimeout,
  };
  const doc = { readyState: "loading", addEventListener() {}, getElementById: () => null };
  const context = { window: win, navigator: { serviceWorker: { ready: Promise.resolve(registration) } }, document: doc,
    Notification: notification, Event: class {}, atob: (value) => Buffer.from(value, "base64").toString("binary"),
    Uint8Array, Promise, console, localStorage: { getItem: () => null, setItem() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/push-service.js"), "utf8"), context);

  const state = await win.ClashlyPush.getState();
  assert.equal(state.configured, true);
  assert.equal(state.enabled, false);
  const enabling = win.ClashlyPush.enable();
  assert.equal(permissionRequests, 1, "permission request must start before the click task yields");
  await enabling;
  assert.equal(subscription.endpoint, "https://push.example/device");
  assert.equal(win.ClashlyPush.isActiveOnThisDevice(), true);
  assert(requests.some((request) => request.body?.action === "subscribe"));
  await win.ClashlyPush.disable();
  assert.equal(subscription, null);
  assert.equal(win.ClashlyPush.isActiveOnThisDevice(), false);
  assert(requests.some((request) => request.body?.action === "unsubscribe"));
});

test("push displays a system notification and its click opens the internal destination", async () => {
  const listeners = new Map();
  const displayed = [];
  const opened = [];
  const scope = "https://clashe.example/app/";
  const serviceWorker = {
    location: { origin: "https://clashe.example", href: `${scope}sw.js` },
    registration: { scope, showNotification: async (...args) => displayed.push(args) },
    clients: { matchAll: async () => [], openWindow: async (url) => opened.push(url) },
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "sw.js"), "utf8"), {
    self: serviceWorker, URL, console,
  });
  let pushWork;
  listeners.get("push")({
    data: { json: () => ({ id: "n1", title: "Clashe", body: "Alex commented.", url: "take.html?id=t1" }) },
    waitUntil: (promise) => { pushWork = promise; },
  });
  await pushWork;
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0][1].body, "Alex commented.");
  assert.equal(displayed[0][1].data.url, `${scope}take.html?id=t1`);

  let clickWork;
  listeners.get("notificationclick")({
    notification: { close() {}, data: { url: displayed[0][1].data.url } },
    waitUntil: (promise) => { clickWork = promise; },
  });
  await clickWork;
  assert.deepEqual(opened, [`${scope}take.html?id=t1`]);

  listeners.get("push")({
    data: { json: () => ({ body: "External link", url: "https://elsewhere.example/" }) },
    waitUntil: (promise) => { pushWork = promise; },
  });
  await pushWork;
  assert.equal(displayed[1][1].data.url, `${scope}notifications.html`);
});
