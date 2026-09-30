(function () {
  const STORAGE_KEY = "clashly-theme";
  const LIGHT = "light";
  const DARK = "dark";
  const MANIFEST_HREF = "manifest.json";
  const APPLE_TOUCH_ICON_HREF = "assets/pwa-192.png";
  const FAVICON_LIGHT_HREF = "assets/Lightmode_logo.svg";
  const FAVICON_DARK_HREF = "assets/Darkmode_logo.svg";
  const THEME_COLOR_LIGHT = "#f5f5f7";
  const THEME_COLOR_DARK = "#0d0e10";

  function readStoredTheme() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored === DARK || stored === LIGHT ? stored : "";
    } catch (error) {
      return "";
    }
  }

  function getActiveTheme() {
    return document.documentElement.dataset.theme === DARK ? DARK : LIGHT;
  }

  function applyTheme(theme) {
    const nextTheme = theme === DARK ? DARK : LIGHT;
    document.documentElement.dataset.theme = nextTheme;
    document.querySelectorAll("[data-theme-logo]").forEach((logo) => {
      logo.src = nextTheme === DARK ? FAVICON_DARK_HREF : FAVICON_LIGHT_HREF;
    });

    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch (error) {
      // Ignore storage failures and keep the in-memory theme.
    }

    syncThemeChrome(nextTheme);
    updateToggleLabel();
  }

  function toggleTheme() {
    applyTheme(getActiveTheme() === DARK ? LIGHT : DARK);
  }

  function updateToggleLabel() {
    const theme = getActiveTheme();
    const label = theme === DARK ? "Light mode" : "Dark mode";
    const isDark = theme === DARK;
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const labelEl = button.querySelector("[data-theme-label]");
      if (labelEl) {
        labelEl.textContent = label;
      } else {
        if (!button.hasAttribute("data-theme-switch")) {
          button.textContent = label;
        }
      }
      button.setAttribute("aria-label", label);
      button.dataset.themeState = theme;
      if (button.hasAttribute("data-theme-switch")) {
        button.setAttribute("aria-checked", isDark ? "true" : "false");
      }
    });
  }

  function ensureHeadLink(rel, href, extras) {
    if (!document.head) return null;
    let el = document.head.querySelector(`link[rel="${rel}"]`);
    if (!el) {
      el = document.createElement("link");
      el.rel = rel;
      el.href = href;
      document.head.appendChild(el);
    }
    el.href = href;
    Object.entries(extras || {}).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
    return el;
  }

  function ensureMeta(name, content, attributeName) {
    if (!document.head) return null;
    const attr = attributeName || "name";
    let el = document.head.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
    return el;
  }

  function ensurePwaHead() {
    ensureHeadLink("manifest", MANIFEST_HREF);
    ensureHeadLink("apple-touch-icon", APPLE_TOUCH_ICON_HREF);
    ensureMeta("mobile-web-app-capable", "yes");
    ensureMeta("apple-mobile-web-app-capable", "yes");
    ensureMeta("apple-mobile-web-app-title", "Clashe");
  }

  function syncThemeChrome(theme) {
    ensureMeta("theme-color", theme === DARK ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
    const icons = Array.from(document.head.querySelectorAll('link[rel="icon"]'));
    icons.slice(0, -1).forEach((icon) => icon.remove());
    ensureHeadLink("icon", theme === DARK ? FAVICON_DARK_HREF : FAVICON_LIGHT_HREF, { type: "image/svg+xml" });
  }

  function bindToggle() {
    document.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-theme-toggle]");
      if (!toggle) return;
      event.preventDefault();
      toggleTheme();
    });
  }

  function boot() {
    // Static HTML links are parsed after this script, so sync once more here.
    syncThemeChrome(getActiveTheme());
    updateToggleLabel();
  }

  ensurePwaHead();
  // Default to light mode unless the user has explicitly chosen a theme before.
  applyTheme(readStoredTheme() || LIGHT);
  bindToggle();

  window.ClashlyTheme = {
    applyTheme,
    toggleTheme,
    getActiveTheme,
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
