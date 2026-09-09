/**
 * Clashe UX Animations
 * GSAP-powered micro-interactions: entrance animations, panel transitions,
 * row reveals. Designed to feel native social-app smooth, not flashy.
 */
(function () {
  const page = document.body ? document.body.dataset.page || "" : "";
  if (page === "auth") return;
  if (window.__clasheUxAnimationsBound) return;
  window.__clasheUxAnimationsBound = true;

  function hasGsap() {
    return typeof window.gsap !== "undefined";
  }

  function prefersReducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  if (!hasGsap() || prefersReducedMotion()) return;

  const gsap = window.gsap;

  /* ── Markers ───────────────────────────────────────────── */
  const ENTRY_ATTR = "data-ux-entry";
  const ROW_ATTR = "data-ux-row";
  const PANEL_ATTR = "data-ux-panel";
  const INTERACTIVE_ATTR = "data-ux-interactive";
  const FINE_POINTER = "(hover: hover) and (pointer: fine)";

  /* ── Selectors ─────────────────────────────────────────── */
  const entrySelectors = [
    ".feed-head",
    ".profile-head",
    ".profile-insights",
    ".profile-content",
    ".composer",
    ".explore-hero",
    ".search-shell__head",
    ".search-panel",
    ".take-detail",
    ".notifications-shell",
    ".side-block",
    ".reset-card",
    ".setup-shell",
  ].join(", ");

  const rowSelectors = [
    ".take-item",
    ".profile-grid-take",
    ".notification-item",
    ".comment-item--root",
    ".comment-item--reply",
    ".search-result",
    ".search-topic-card",
    ".explore-card",
    ".follow-list-item",
    ".feed-empty-visual",
  ].join(", ");

  // Only interactive elements that genuinely benefit from lift
  const liftSelectors = [
    ".btn--primary",
    ".btn--ghost",
    ".bottom-nav__link--create",
    ".explore-hero__link",
  ].join(", ");

  const panelSelectors = [
    "#create-modal:not([hidden]) .composer-modal__dialog",
    "#comments-drawer:not([hidden]) .comments-drawer__panel",
    "#notifications-drawer:not([hidden]) .notifications-drawer__panel",
    "#more-drawer:not([hidden]) .more-drawer__panel",
    "#edit-profile-modal:not([hidden]) .edit-profile-modal__panel",
    "#follow-list-modal:not([hidden]) .follow-list-modal__panel",
  ];

  let mutationRaf = 0;
  const queuedRoots = new Set();

  function toArray(v) {
    return Array.isArray(v) ? v : Array.from(v || []);
  }

  function getFresh(root, selector, attr) {
    const candidates = [];
    if (root instanceof Element && root.matches(selector)) {
      candidates.push(root);
    }
    candidates.push(...toArray(root.querySelectorAll(selector)));
    return candidates.filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hasAttribute(attr)) return false;
      el.setAttribute(attr, "1");
      return true;
    });
  }

  /* ── Page entry animations ─────────────────────────────── */
  function animateEntries() {
    // Animate whole app-main container in
    const appMain = document.querySelector(".app-main, .reset-main, .setup-main");
    if (appMain instanceof HTMLElement && !appMain.hasAttribute(ENTRY_ATTR)) {
      appMain.setAttribute(ENTRY_ATTR, "1");
      gsap.from(appMain, {
        opacity: 0,
        y: 10,
        duration: 0.38,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    }

    // Sidebar nav links slide in from left
    const sideLinks = toArray(document.querySelectorAll(".desktop-nav__link"));
    if (sideLinks.length && !sideLinks[0].hasAttribute(ENTRY_ATTR)) {
      sideLinks.forEach((el) => el.setAttribute(ENTRY_ATTR, "1"));
      gsap.from(sideLinks, {
        opacity: 0,
        x: -8,
        duration: 0.32,
        stagger: 0.035,
        ease: "power2.out",
        clearProps: "transform,opacity",
        delay: 0.05,
      });
    }

    // Bottom nav links pop up
    const bottomLinks = toArray(document.querySelectorAll(".bottom-nav__link"));
    if (bottomLinks.length && !bottomLinks[0].hasAttribute(ENTRY_ATTR)) {
      bottomLinks.forEach((el) => el.setAttribute(ENTRY_ATTR, "1"));
      gsap.from(bottomLinks, {
        opacity: 0,
        y: 6,
        duration: 0.28,
        stagger: 0.025,
        ease: "power2.out",
        clearProps: "transform,opacity",
        delay: 0.06,
      });
    }

    // Structural sections
    const entries = getFresh(document, entrySelectors, ENTRY_ATTR);
    if (!entries.length) return;
    gsap.from(entries, {
      opacity: 0,
      y: 8,
      duration: 0.38,
      stagger: 0.025,
      ease: "power2.out",
      clearProps: "transform,opacity",
      delay: 0.07,
    });
  }

  /* ── Feed row reveal animations ─────────────────────────── */
  function animateRowsInRoot(root, isInitialPass) {
    if (!(root instanceof Element || root instanceof Document)) return;
    const rows = getFresh(root, rowSelectors, ROW_ATTR);
    if (!rows.length) return;

    if (!isInitialPass) {
      // Dynamic rows during infinite scroll:
      // Fade in smoothly without vertical translateY (which drops 120Hz frames during momentum scroll)
      gsap.fromTo(
        rows,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.18,
          ease: "power1.out",
          clearProps: "opacity",
          overwrite: "auto",
        }
      );
      return;
    }

    gsap.from(rows, {
      opacity: 0,
      y: 14,
      duration: 0.38,
      stagger: 0.038,
      ease: "power2.out",
      clearProps: "transform,opacity",
      overwrite: "auto",
    });
  }

  /* ── Panel / modal transitions ─────────────────────────── */
  function resetHiddenPanels() {
    toArray(
      document.querySelectorAll(
        ".composer-modal__dialog, .comments-drawer__panel, .notifications-drawer__panel, .more-drawer__panel, .edit-profile-modal__panel, .follow-list-modal__panel"
      )
    ).forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      if (panel.closest("[hidden]")) {
        panel.removeAttribute(PANEL_ATTR);
      }
    });
  }

  function animateVisiblePanels() {
    panelSelectors.forEach((selector) => {
      const panel = document.querySelector(selector);
      if (!(panel instanceof HTMLElement)) return;
      if (panel.hasAttribute(PANEL_ATTR)) return;
      panel.setAttribute(PANEL_ATTR, "1");

      const isSlide =
        selector.includes("notifications-drawer") ||
        selector.includes("more-drawer");

      gsap.fromTo(
        panel,
        isSlide ? { opacity: 0, x: -16 } : { opacity: 0, y: 16 },
        {
          opacity: 1,
          x: 0,
          y: 0,
          duration: 0.28,
          ease: "power3.out",
          clearProps: "transform,opacity",
          overwrite: "auto",
        }
      );
    });
  }

  /* ── Subtle lift on primary interactive elements ─────────── */
  function bindInteractiveLift(root) {
    if (!window.matchMedia || !window.matchMedia(FINE_POINTER).matches) return;

    const nodes = toArray(root.querySelectorAll(liftSelectors));
    nodes.forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.hasAttribute(INTERACTIVE_ATTR)) return;
      el.setAttribute(INTERACTIVE_ATTR, "1");

      el.addEventListener("pointerenter", () => {
        if (el.matches(":disabled")) return;
        gsap.to(el, { y: -1, duration: 0.18, ease: "power2.out", overwrite: "auto" });
      });

      el.addEventListener("pointerleave", () => {
        gsap.to(el, { y: 0, scale: 1, duration: 0.18, ease: "power2.out", overwrite: "auto" });
      });

      el.addEventListener("pointerdown", () => {
        if (el.matches(":disabled")) return;
        gsap.to(el, { scale: 0.97, duration: 0.1, ease: "power2.out", overwrite: "auto" });
      });

      el.addEventListener("pointerup", () => {
        gsap.to(el, { scale: 1, duration: 0.14, ease: "power2.out", overwrite: "auto" });
      });
    });
  }

  /* ── Vote bar animation (triggered externally) ──────────── */
  window.clasheAnimateVoteBar = function (agreeEl, disagreeEl, agreePct) {
    if (!agreeEl || !disagreeEl) return;
    gsap.to(agreeEl, {
      width: agreePct + "%",
      duration: 0.5,
      ease: "power2.out",
    });
    gsap.to(disagreeEl, {
      width: (100 - agreePct) + "%",
      duration: 0.5,
      ease: "power2.out",
    });
  };

  /* ── MutationObserver for dynamically added content ─────── */
  function flushQueuedRoots() {
    mutationRaf = 0;
    const roots = Array.from(queuedRoots);
    queuedRoots.clear();
    roots.forEach((root) => {
      if (!(root instanceof Element || root instanceof Document)) return;
      animateRowsInRoot(root, false);
      bindInteractiveLift(root);
    });
    animateVisiblePanels();
    resetHiddenPanels();
  }

  function queueRoot(root) {
    if (!(root instanceof Element || root instanceof Document)) return;
    queuedRoots.add(root);
    if (mutationRaf) return;
    mutationRaf = window.requestAnimationFrame(flushQueuedRoots);
  }

  function observeDom() {
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "childList") {
          record.addedNodes.forEach((node) => {
            if (node instanceof Element) queueRoot(node);
          });
        }
        if (record.type === "attributes" && record.target instanceof Element) {
          // Only re-animate panels on hidden attr changes (open/close),
          // not on class changes which fire on every hover/active state.
          queueRoot(record.target);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      // Watch only 'hidden' (panel visibility) — not 'class' which
      // fires on every hover/focus/active state and bloats RAF calls.
      attributeFilter: ["hidden"],
    });
  }

  function boot() {
    animateEntries();
    animateRowsInRoot(document, true);
    bindInteractiveLift(document);
    animateVisiblePanels();
    observeDom();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
