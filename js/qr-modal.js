(function () {
  const MODAL_ID = "profile-qr-modal";
  const QR_CANVAS_ID = "profile-qr-canvas";
  let _qrLibReady = false;
  let _qrLibLoading = false;

  // ─── QR library loader (qrcodejs, ~14 KB, no deps) ────────────────────────
  function loadQrLib(callback) {
    if (_qrLibReady) { callback(); return; }
    if (_qrLibLoading) { document.addEventListener("clashly:qr-lib-ready", callback, { once: true }); return; }
    _qrLibLoading = true;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.async = true;
    script.onload = function () {
      _qrLibReady = true;
      _qrLibLoading = false;
      document.dispatchEvent(new CustomEvent("clashly:qr-lib-ready"));
      callback();
    };
    script.onerror = function () {
      _qrLibLoading = false;
      console.error("[ClashlyQR] Failed to load QR library.");
    };
    document.head.appendChild(script);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function isDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function getProfileUrl(profile) {
    if (!profile || !profile.id) return window.location.href;
    const url = new URL("profile.html", window.location.href);
    url.searchParams.set("id", profile.id);
    if (profile.username) url.searchParams.set("u", profile.username);
    return url.href;
  }

  function getDisplayUsername(profile) {
    return profile && profile.username ? "@" + profile.username : "@profile";
  }

  // ─── Modal markup ──────────────────────────────────────────────────────────
  function buildMarkup() {
    return `
      <div id="${MODAL_ID}" class="profile-qr-modal" hidden aria-modal="true" role="dialog" aria-labelledby="profile-qr-title">
        <div class="profile-qr-modal__backdrop" data-close-qr-modal="true"></div>
        <section class="profile-qr-modal__panel">
          <header class="profile-qr-modal__head">
            <div>
              <p class="profile-qr-modal__eyebrow">Scan to visit</p>
              <h2 id="profile-qr-title" class="profile-qr-modal__title">Profile QR</h2>
            </div>
            <button type="button" class="modal-close-btn" data-close-qr-modal="true" aria-label="Close QR code modal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </header>

          <div class="profile-qr-modal__body">
            <div class="profile-qr-canvas-wrap">
              <div id="${QR_CANVAS_ID}" class="profile-qr-canvas"></div>
            </div>

            <p id="profile-qr-username" class="profile-qr-modal__username"></p>
            <p id="profile-qr-url" class="profile-qr-modal__url"></p>

            <p id="profile-qr-status" class="feed-state" hidden></p>

            <div class="profile-qr-modal__actions">
              <button type="button" class="btn btn--solid profile-qr-modal__btn-download" id="profile-qr-download">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download PNG
              </button>
              <button type="button" class="btn profile-qr-modal__btn-copy" id="profile-qr-copy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="10" height="10" rx="2"/>
                  <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy link
              </button>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function ensureModal() {
    if (document.getElementById(MODAL_ID) || !document.body) return;
    document.body.insertAdjacentHTML("beforeend", buildMarkup());
  }

  // ─── QR generation ─────────────────────────────────────────────────────────
  function generateQr(url) {
    const container = document.getElementById(QR_CANVAS_ID);
    if (!container) return;
    container.innerHTML = "";

    const dark = isDark();
    // eslint-disable-next-line no-undef
    new QRCode(container, {
      text: url,
      width: 220,
      height: 220,
      colorDark: dark ? "#f0f0f3" : "#0a0a0b",
      colorLight: dark ? "#161719" : "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  let _currentProfile = null;
  let _currentUrl = "";

  function setStatus(msg, type) {
    const el = document.getElementById("profile-qr-status");
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.classList.remove("is-error", "is-success");
    if (type === "error") el.classList.add("is-error");
    if (type === "success") el.classList.add("is-success");
  }

  // ─── Open / Close ──────────────────────────────────────────────────────────
  function open(profile) {
    ensureModal();
    _currentProfile = profile || null;
    _currentUrl = getProfileUrl(_currentProfile);

    const usernameEl = document.getElementById("profile-qr-username");
    const urlEl = document.getElementById("profile-qr-url");
    if (usernameEl) usernameEl.textContent = getDisplayUsername(_currentProfile);
    if (urlEl) urlEl.textContent = _currentUrl;
    setStatus("", "");

    // Clear any stale QR while the library loads
    const canvas = document.getElementById(QR_CANVAS_ID);
    if (canvas) canvas.innerHTML = '<span class="profile-qr-canvas__loading">Generating&hellip;</span>';

    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () {
      modal.classList.add("is-open");
    });

    // Lazy-load QR library only now
    loadQrLib(function () {
      generateQr(_currentUrl);
    });
  }

  function close() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.classList.remove("is-open");
    setTimeout(function () {
      if (!modal.classList.contains("is-open")) {
        modal.hidden = true;
        document.body.style.overflow = "";
        setStatus("", "");
      }
    }, 220);
  }

  // ─── Download ──────────────────────────────────────────────────────────────
  function downloadQr() {
    const container = document.getElementById(QR_CANVAS_ID);
    if (!container) return;
    const canvas = container.querySelector("canvas");
    if (!canvas) {
      // qrcodejs may render an img instead of canvas in some browsers
      const img = container.querySelector("img");
      if (img) {
        // Convert img src to download via a temporary canvas
        const tmp = document.createElement("canvas");
        tmp.width = 220;
        tmp.height = 220;
        const ctx = tmp.getContext("2d");
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = function () {
          ctx.drawImage(image, 0, 0);
          triggerDownload(tmp, "clashe-qr.png");
        };
        image.onerror = function () { setStatus("Could not export QR image.", "error"); };
        image.src = img.src;
      }
      return;
    }
    triggerDownload(canvas, "clashe-qr.png");
  }

  function triggerDownload(canvas, filename) {
    try {
      const link = document.createElement("a");
      link.download = filename;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      setStatus("Download failed.", "error");
    }
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  document.addEventListener("click", async function (event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.closest("[data-close-qr-modal='true']")) {
      event.preventDefault();
      close();
      return;
    }

    if (target.closest("#profile-qr-download")) {
      event.preventDefault();
      downloadQr();
      return;
    }

    if (target.closest("#profile-qr-copy")) {
      event.preventDefault();
      try {
        await window.ClashlyUtils.copyText(_currentUrl);
        if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
          window.ClashlyUtils.showToast("Profile link copied", "success");
        }
        setStatus("", "");
      } catch (err) {
        setStatus("Could not copy link.", "error");
      }
      return;
    }
  });

  document.addEventListener("keydown", function (event) {
    const modal = document.getElementById(MODAL_ID);
    if (event.key === "Escape" && modal && !modal.hidden) close();
  });

  // ─── Public API ────────────────────────────────────────────────────────────
  window.ClashlyQrModal = { open, close };
})();
