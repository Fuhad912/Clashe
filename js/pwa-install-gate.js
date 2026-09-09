// pwa-install-gate.js — full-screen "install to continue" interstitial.
//
// Real web platforms give no API to force a PWA install; the browser alone
// decides whether/when an install button can even appear. What this module
// does instead is the closest honest equivalent: show a full-screen prompt
// on a cooldown, on every gated page, until the person installs or the
// browser genuinely has no install path available for them (desktop
// Safari/Firefox, or iOS with a manual "Add to Home Screen" fallback) — in
// which case it lets them continue rather than dead-ending them.
(function () {
  const STORAGE_KEY = "clashe-install-gate-dismissed-at";
  const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
  const PWA_STATE_EVENT = "clashly:pwa-state";
  const MODAL_ID = "pwa-install-gate";

  function isIosLikeDevice() {
    const ua = window.navigator.userAgent || "";
    const platform = window.navigator.platform || "";
    return /iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  }

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
    } catch (_error) {
      // Private browsing or storage disabled — the gate will just show
      // again next load, which is an acceptable fallback, not a crash.
    }
  }

  function isWithinCooldown() {
    const dismissedAt = getDismissedAt();
    if (!dismissedAt) return false;
    return Date.now() - dismissedAt < COOLDOWN_MS;
  }

  function buildModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement("section");
    modal.id = MODAL_ID;
    modal.className = "pwa-install-gate";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "pwa-install-gate-title");
    modal.innerHTML = `
      <div class="pwa-install-gate__panel">
        <div class="pwa-install-gate__art" aria-hidden="true">
          <img src="assets/clashly-mark.svg" alt="" class="pwa-install-gate__mark" />
        </div>
        <h2 id="pwa-install-gate-title" class="pwa-install-gate__title">Install Clashe</h2>
        <p class="pwa-install-gate__copy" id="pwa-install-gate-copy">
          Install Clashe for a faster, full-screen experience with no browser bar in the way.
        </p>
        <div class="pwa-install-gate__actions">
          <button type="button" class="btn btn--primary pwa-install-gate__install" id="pwa-install-gate-install">
            Install app
          </button>
          <button type="button" class="btn btn--ghost pwa-install-gate__dismiss" id="pwa-install-gate-dismiss">
            Not now
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function showModal() {
    const modal = buildModal();
    modal.hidden = false;
    document.body.classList.add("pwa-install-gate-open");
  }

  function hideModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("pwa-install-gate-open");
  }

  function render(state) {
    // Already running as an installed app — nothing to gate, ever.
    if (isStandaloneDisplayMode() || (state && state.installed)) {
      hideModal();
      return;
    }

    if (isWithinCooldown()) {
      hideModal();
      return;
    }

    const modal = buildModal();
    const copyEl = modal.querySelector("#pwa-install-gate-copy");
    const installBtn = modal.querySelector("#pwa-install-gate-install");
    const canInstall = Boolean(state && state.canInstall);
    const secureContext = !state || state.secureContext !== false;
    const iosLike = isIosLikeDevice();

    if (!secureContext) {
      // Nothing installable over an insecure origin — don't block anyone
      // on what would effectively be a dead end.
      hideModal();
      return;
    }

    if (canInstall) {
      copyEl.textContent = "Install Clashe for a faster, full-screen experience with no browser bar in the way.";
      installBtn.hidden = false;
      installBtn.textContent = "Install app";
      installBtn.disabled = false;
    } else if (iosLike) {
      copyEl.textContent = "Install Clashe: tap the Share icon in Safari, then choose \u201cAdd to Home Screen.\u201d";
      installBtn.hidden = true;
    } else {
      // No install path this browser can offer (desktop Safari/Firefox, or
      // Chrome/Edge before the prompt has been captured yet). Nothing to
      // gate behind here — show once for awareness, then get out of the way.
      copyEl.textContent =
        "Clashe works best installed as an app. This browser doesn't support installing yet — try Chrome, Edge, or Safari on iOS.";
      installBtn.hidden = true;
    }

    showModal();
  }

  function handleInstallClick() {
    if (!window.ClashlyPWA || typeof window.ClashlyPWA.promptInstall !== "function") return;
    window.ClashlyPWA.promptInstall().then((result) => {
      if (result && (result.status === "accepted" || result.status === "installed")) {
        hideModal();
      }
      // A dismissed native prompt still counts as "seen it" for the cooldown —
      // re-showing immediately after someone just said no would be hostile.
      setDismissedNow();
    });
  }

  function bindOnce() {
    const modal = buildModal();
    if (modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";

    modal.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("#pwa-install-gate-install")) {
        handleInstallClick();
        return;
      }
      if (target.closest("#pwa-install-gate-dismiss")) {
        setDismissedNow();
        hideModal();
      }
    });
  }

  function init() {
    bindOnce();

    if (window.ClashlyPWA && typeof window.ClashlyPWA.getState === "function") {
      render(window.ClashlyPWA.getState());
    }

    // The state machine in app.js may still be initializing when this runs
    // (script order isn't guaranteed), so listen for its broadcast event
    // rather than assuming window.ClashlyPWA already exists.
    window.addEventListener(PWA_STATE_EVENT, (event) => {
      render(event && event.detail ? event.detail : null);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
