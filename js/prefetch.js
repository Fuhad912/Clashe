/**
 * Clashe Speculative Preloading & Prerendering
 * Uses the native Speculation Rules API (Chrome, Edge, Opera) and <link rel="prefetch">
 * fallback to preload and prerender primary navigation destinations before the user taps them.
 */
(function () {
  const PREFETCH_PAGES = [
    "index.html",
    "search.html",
    "notifications.html",
    "profile.html",
    "settings.html",
  ];

  const prefetchedUrls = new Set();

  function supportsSpeculationRules() {
    return (
      typeof HTMLScriptElement !== "undefined" &&
      HTMLScriptElement.supports &&
      HTMLScriptElement.supports("speculationrules")
    );
  }

  function injectSpeculationRules() {
    try {
      const script = document.createElement("script");
      script.type = "speculationrules";
      const rules = {
        prerender: [
          {
            source: "list",
            urls: PREFETCH_PAGES,
            eagerness: "moderate", // Prerenders on hover or pointerdown
          },
        ],
        prefetch: [
          {
            source: "list",
            urls: PREFETCH_PAGES,
            eagerness: "immediate", // Prefetches documents into HTTP cache immediately
          },
        ],
      };
      script.textContent = JSON.stringify(rules);
      document.head.appendChild(script);
    } catch (_err) {
      // Ignore errors if speculation rules syntax is not supported
    }
  }

  function prefetchUrl(url) {
    if (!url || prefetchedUrls.has(url)) return;
    prefetchedUrls.add(url);

    try {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = url;
      link.as = "document";
      document.head.appendChild(link);
    } catch (_err) {}
  }

  function initNavHoverPrefetch() {
    const handlePointerHover = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      if (href.endsWith(".html") && !href.startsWith("http") && !href.startsWith("//")) {
        prefetchUrl(href);
      }
    };

    document.addEventListener("pointerenter", handlePointerHover, { passive: true, capture: true });
    document.addEventListener("touchstart", handlePointerHover, { passive: true, capture: true });
  }

  function warmPrimaryPagesOnIdle() {
    const currentFile = window.location.pathname.split("/").pop() || "index.html";
    const pagesToWarm = PREFETCH_PAGES.filter((p) => p !== currentFile);

    const runWarm = () => {
      pagesToWarm.forEach((page) => prefetchUrl(page));
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(runWarm, { timeout: 2500 });
    } else {
      window.setTimeout(runWarm, 1800);
    }
  }

  function init() {
    if (supportsSpeculationRules()) {
      injectSpeculationRules();
    } else {
      warmPrimaryPagesOnIdle();
    }
    initNavHoverPrefetch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
