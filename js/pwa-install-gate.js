// pwa-install-gate.js — ThinkRight-style smooth PWA install handler.
// Zero blocking modals. Zero viewport locks.
//
// Features:
// 1. Manages expandable #installAppCard (on auth.html & settings.html).
// 2. On feed/content pages, shows a sleek, non-blocking bottom floating bar
//    only when the browser fires beforeinstallprompt and the user hasn't dismissed it.
// 3. Gracefully disables when already running standalone.
(function () {
  const STORAGE_KEY = "clashe-pwa-bar-dismissed-at";
  const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days cooldown after dismiss
  const BAR_ID = "clashe-pwa-bar";

  function isStandaloneDisplayMode() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.navigator.standalone === true
    );
  }

  function getDismissedAt() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (_error) {
      return 0;
    }
  }

  function setDismissedNow() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch (_error) {}
  }

  function isWithinCooldown() {
    const dismissedAt = getDismissedAt();
    if (!dismissedAt) return false;
    return Date.now() - dismissedAt < COOLDOWN_MS;
  }

  // ── 1. ThinkRight-Style #installAppCard Handler ────────────────
  function initInstallAppCard() {
    const installCard = document.getElementById("installAppCard");
    const installToggle = document.getElementById("installAppToggle");
    const installBtn =
      document.getElementById("authInstallBtn") ||
      document.getElementById("settingsInstallBtn") ||
      document.getElementById("loginInstallBtn");

    if (!installCard || !installToggle) return;

    if (isStandaloneDisplayMode()) {
      installCard.hidden = true;
      return;
    }

    if (installToggle.dataset.bound !== "1") {
      installToggle.dataset.bound = "1";
      installToggle.addEventListener("click", () => {
        const isOpen = installCard.classList.toggle("is-open");
        installToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
    }

    function syncBtn() {
      const promptEvent = window.__pwaInstallPrompt;
      if (installBtn && promptEvent && !window.__pwaInstallConsumed) {
        installBtn.style.display = "inline-flex";
      }
    }

    syncBtn();
    window.addEventListener("clashly:install-prompt-ready", syncBtn);
    window.addEventListener("beforeinstallprompt", syncBtn);

    if (installBtn && installBtn.dataset.bound !== "1") {
      installBtn.dataset.bound = "1";
      installBtn.addEventListener("click", async () => {
        const promptEvent = window.__pwaInstallPrompt;
        if (promptEvent && typeof promptEvent.prompt === "function") {
          try {
            await promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            if (choice && choice.outcome === "accepted") {
              installBtn.style.display = "none";
              installCard.hidden = true;
              window.__pwaInstallConsumed = true;
            }
          } catch (_err) {}
          window.__pwaInstallPrompt = null;
        } else if (window.ClashlyPWA && typeof window.ClashlyPWA.promptInstall === "function") {
          window.ClashlyPWA.promptInstall().then((res) => {
            if (res && res.outcome === "accepted") {
              installBtn.style.display = "none";
              installCard.hidden = true;
            }
          });
        }
      });
    }
  }

  // ── 2. Sleek Non-Blocking Bottom Banner for Feed/Content Pages ──
  function buildBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;

    bar = document.createElement("aside");
    bar.id = BAR_ID;
    bar.className = "clashe-pwa-bar";
    bar.setAttribute("aria-label", "Install Clashe");
    bar.innerHTML = `
      <div class="clashe-pwa-bar__inner">
        <img src="assets/pwa-192.png" alt="" class="clashe-pwa-bar__icon" />
        <div class="clashe-pwa-bar__text">
          <strong>Install Clashe</strong>
          <span>Add to Home screen for the best experience</span>
        </div>
        <div class="clashe-pwa-bar__actions">
          <button type="button" class="clashe-pwa-bar__btn" id="clashe-pwa-bar-install">Install</button>
          <button type="button" class="clashe-pwa-bar__close" id="clashe-pwa-bar-close" aria-label="Dismiss">✕</button>
        </div>
      </div>
    `;

    document.body.appendChild(bar);

    const installBtn = bar.querySelector("#clashe-pwa-bar-install");
    const closeBtn = bar.querySelector("#clashe-pwa-bar-close");

    if (installBtn) {
      installBtn.addEventListener("click", async () => {
        const promptEvent = window.__pwaInstallPrompt;
        if (promptEvent && typeof promptEvent.prompt === "function") {
          try {
            await promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            if (choice && choice.outcome === "accepted") {
              window.__pwaInstallConsumed = true;
              hideBar();
            }
          } catch (_err) {}
          window.__pwaInstallPrompt = null;
        } else if (window.ClashlyPWA && typeof window.ClashlyPWA.promptInstall === "function") {
          window.ClashlyPWA.promptInstall().then((res) => {
            if (res && res.outcome === "accepted") {
              hideBar();
            }
          });
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        setDismissedNow();
        hideBar();
      });
    }

    return bar;
  }

  function showBar() {
    if (isStandaloneDisplayMode()) return;
    if (isWithinCooldown()) return;
    if (document.getElementById("installAppCard")) return; // Page already has dedicated card

    const bar = buildBar();
    requestAnimationFrame(() => {
      bar.classList.add("is-visible");
    });
  }

  function hideBar() {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    bar.classList.remove("is-visible");
    setTimeout(() => {
      if (bar.parentNode) {
        bar.parentNode.removeChild(bar);
      }
    }, 280);
  }

  function onPromptReady() {
    initInstallAppCard();
    if (!document.getElementById("installAppCard")) {
      showBar();
    }
  }

  function init() {
    initInstallAppCard();

    if (isStandaloneDisplayMode()) return;

    if (window.__pwaInstallPrompt && !window.__pwaInstallConsumed) {
      onPromptReady();
    }

    window.addEventListener("clashly:install-prompt-ready", () => {
      onPromptReady();
    });

    window.addEventListener("beforeinstallprompt", (e) => {
      window.__pwaInstallPrompt = e;
      onPromptReady();
    });

    window.addEventListener("appinstalled", () => {
      window.__pwaInstallConsumed = true;
      hideBar();
      const card = document.getElementById("installAppCard");
      if (card) card.hidden = true;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
