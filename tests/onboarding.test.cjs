const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(page = "home") {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const classes = new Set();
  const elements = new Map();
  const listeners = new Map();
  const getElement = (selector) => {
    if (!elements.has(selector)) elements.set(selector, { hidden: false, textContent: "", innerHTML: "", focus() { document.activeElement = this; } });
    return elements.get(selector);
  };
  const modal = {
    hidden: true,
    querySelector: getElement,
    querySelectorAll: () => [getElement("close"), getElement("skip"), getElement("next")],
    contains: () => true,
  };
  const createModal = { hidden: true };
  const replayButton = { addEventListener(_name, callback) { this.click = callback; } };
  const document = {
    body: { dataset: { page }, classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) }, style: {} },
    activeElement: null,
    getElementById: (id) => id === "onboarding-modal" ? modal : id === "create-modal" ? createModal : id === "settings-view-tutorial" && page === "settings" ? replayButton : null,
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  class HTMLElement {}
  const db = { seen: false, updates: 0, error: null };
  const window = {
    localStorage: storage,
    addEventListener() {},
    ClashlyProfiles: {
      hasSeenOnboardingInDb: async () => ({ seen: db.seen, error: db.error }),
      markOnboardingSeenInDb: async () => { db.updates += 1; return { error: null }; },
    },
    ClashlySession: { resolveSession: async () => ({ user: { id: "user-1" } }) },
    setTimeout: (callback) => callback(),
  };
  const source = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8").replace(
    'document.addEventListener("DOMContentLoaded", boot);',
    'window.__onboardingTest = { hasSeenOnboarding, markOnboardingSeen, openOnboardingModal, closeOnboardingModal, bindOnboardingModal, readOnboardingStep, saveOnboardingStep, getOnboardingModalMarkup };'
  );
  vm.runInNewContext(source, { window, document, navigator: {}, HTMLElement, Element: HTMLElement, console, setTimeout, Promise });
  const click = (action) => {
    const button = { getAttribute: () => action };
    const target = new HTMLElement();
    target.closest = () => button;
    listeners.get("click")({ target, preventDefault() {} });
  };
  const keydown = (key, shiftKey = false) => listeners.get("keydown")({ key, shiftKey, preventDefault() {} });
  return { tour: window.__onboardingTest, window, document, storage, store, db, modal, createModal, replayButton, classes, elements, click, keydown };
}

test("new user can resume, complete, and replay the four-step tutorial", async () => {
  const { tour, storage, db, modal, createModal, elements, click } = setup();
  storage.setItem("clashe-onboarding-pending:user-1", "1");
  assert.equal(await tour.hasSeenOnboarding("user-1"), false);
  assert.match(tour.getOnboardingModalMarkup(), /Write my first take/);
  tour.bindOnboardingModal();
  tour.openOnboardingModal("user-1");
  assert.equal(elements.get("#onboarding-step-count").textContent, "1 of 4");
  click("next");
  click("next");
  assert.equal(elements.get("#onboarding-step-count").textContent, "3 of 4");
  click("close");
  assert.equal(modal.hidden, true);
  assert.equal(tour.readOnboardingStep("user-1"), 2);
  assert.equal(storage.getItem("clashe-onboarding-seen:user-1"), null);
  tour.openOnboardingModal("user-1");
  assert.equal(elements.get("#onboarding-step-count").textContent, "3 of 4");
  click("next");
  click("create");
  assert.equal(createModal.hidden, false);
  assert.equal(storage.getItem("clashe-onboarding-seen:user-1"), "1");
  assert.equal(storage.getItem("clashe-onboarding-step:user-1"), null);
  assert.equal(db.updates, 1);
  tour.openOnboardingModal("user-1", { replay: true });
  assert.equal(elements.get("#onboarding-step-count").textContent, "1 of 4");
  click("skip");
  assert.equal(await tour.hasSeenOnboarding("user-1"), true);
  assert.equal(db.updates, 1, "replay does not rewrite completed state");
});

test("Settings replay opens at step one and Explore feed completes it", async () => {
  const { tour, replayButton, modal, elements, click, storage } = setup("settings");
  tour.bindOnboardingModal();
  await replayButton.click();
  assert.equal(modal.hidden, false);
  assert.equal(elements.get("#onboarding-step-count").textContent, "1 of 4");
  click("next");
  click("back");
  assert.equal(elements.get("#onboarding-step-count").textContent, "1 of 4");
  click("next"); click("next"); click("next");
  click("explore");
  assert.equal(modal.hidden, true);
  assert.equal(storage.getItem("clashe-onboarding-seen:user-1"), "1");
});

test("a database error only falls back to tutorial for a user who just completed setup", async () => {
  const { tour, storage, db } = setup();
  db.error = new Error("offline");
  assert.equal(await tour.hasSeenOnboarding("returning-user"), null);
  storage.setItem("clashe-onboarding-pending:new-user", "1");
  assert.equal(await tour.hasSeenOnboarding("new-user"), false);
});

test("keyboard focus stays in the dialog and Escape saves the current step", () => {
  const { tour, modal, document, elements, click, keydown } = setup();
  tour.bindOnboardingModal();
  tour.openOnboardingModal("user-1");
  keydown("Tab");
  assert.equal(document.activeElement, elements.get("close"));
  keydown("Tab", true);
  assert.equal(document.activeElement, elements.get("next"));
  click("next");
  keydown("Escape");
  assert.equal(modal.hidden, true);
  assert.equal(tour.readOnboardingStep("user-1"), 1);
});
