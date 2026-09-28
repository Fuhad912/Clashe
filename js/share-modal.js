(function () {
  const MODAL_ID = "share-modal";

  function buildAvatar(profile) {
    if (profile && profile.avatar_url) {
      return `<div class="share-preview__avatar"><img src="${window.ClashlyUtils.escapeHtml(profile.avatar_url)}" alt="" decoding="async" /></div>`;
    }

    const username = profile && profile.username ? profile.username : "cl";
    return `<div class="share-preview__avatar">${window.ClashlyUtils.escapeHtml(
      window.ClashlyUtils.initialsFromName(username)
    )}</div>`;
  }

  function getUsername(profile) {
    return profile && profile.username ? `@${profile.username}` : "@anonymous";
  }

  function getShareText(take) {
    if (!take) return "See this take on Clashe";
    const username = getUsername(take.profile);
    return `${take.content} - ${username} on Clashe`;
  }

  function getShareUrl(take) {
    if (!take || !take.id) return window.location.href;
    return window.ClashlyUtils.toTakeUrl(take.id);
  }

  function renderPlatformIcon(name) {
    const icons = {
      x: `
        <i class="app-icon fa-brands fa-x-twitter" aria-hidden="true"></i>
      `,
      whatsapp: `
        <i class="app-icon fa-brands fa-whatsapp" aria-hidden="true"></i>
      `,
      telegram: `
        <i class="app-icon fa-brands fa-telegram" aria-hidden="true"></i>
      `,
      instagram: `
        <i class="app-icon fa-brands fa-instagram" aria-hidden="true"></i>
      `,
      reddit: `
        <i class="app-icon fa-brands fa-reddit-alien" aria-hidden="true"></i>
      `,
      facebook: `
        <i class="app-icon fa-brands fa-facebook-f" aria-hidden="true"></i>
      `,
      copy: `
        <i class="app-icon fa-solid fa-link" aria-hidden="true"></i>
      `,
    };

    return icons[name] || "";
  }

  function buildMarkup() {
    return `
      <div id="${MODAL_ID}" class="share-modal" hidden>
        <div class="share-modal__backdrop" data-close-share-modal="true"></div>
        <section class="share-modal__panel" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
          <header class="share-modal__head">
            <div>
              <p class="share-modal__eyebrow">Send this take</p>
              <h2 id="share-modal-title">Share</h2>
            </div>
            <button type="button" class="modal-close-btn" data-close-share-modal="true" aria-label="Close share">
              <i class="app-icon fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </header>

          <section id="share-preview" class="share-preview"></section>
          <p class="share-modal__copy">Choose where to share.</p>
          <p id="share-modal-status" class="feed-state" hidden></p>

          <div class="share-actions">
            <div class="share-destinations" role="group" aria-label="Share destinations">
            <a href="#" class="share-action" data-share-action="x" target="_blank" rel="noreferrer">
              <span class="share-action__orb share-action__orb--x">${renderPlatformIcon("x")}</span>
              <span class="share-action__label">X</span>
            </a>
            <a href="#" class="share-action" data-share-action="whatsapp" target="_blank" rel="noreferrer">
              <span class="share-action__orb share-action__orb--whatsapp">${renderPlatformIcon("whatsapp")}</span>
              <span class="share-action__label">WhatsApp</span>
            </a>
            <a href="#" class="share-action" data-share-action="telegram" target="_blank" rel="noreferrer">
              <span class="share-action__orb share-action__orb--telegram">${renderPlatformIcon("telegram")}</span>
              <span class="share-action__label">Telegram</span>
            </a>
            <button type="button" class="share-action" data-share-action="instagram">
              <span class="share-action__orb share-action__orb--instagram">${renderPlatformIcon("instagram")}</span>
              <span class="share-action__label">Instagram</span>
            </button>
            <a href="#" class="share-action" data-share-action="reddit" target="_blank" rel="noreferrer">
              <span class="share-action__orb share-action__orb--reddit">${renderPlatformIcon("reddit")}</span>
              <span class="share-action__label">Reddit</span>
            </a>
            <a href="#" class="share-action" data-share-action="facebook" target="_blank" rel="noreferrer">
              <span class="share-action__orb share-action__orb--facebook">${renderPlatformIcon("facebook")}</span>
              <span class="share-action__label">Facebook</span>
            </a>
            </div>
            <button type="button" class="share-action share-action--utility" data-share-action="copy-link">
              <span class="share-action__orb share-action__orb--copy">${renderPlatformIcon("copy")}</span>
              <span class="share-action__label">Copy link</span>
            </button>
          </div>
        </section>
      </div>
    `;
  }

  function ensureModal() {
    if (document.getElementById(MODAL_ID) || !document.body) return;
    document.body.insertAdjacentHTML("beforeend", buildMarkup());
  }

  function setStatus(message, type) {
    const statusEl = document.getElementById("share-modal-status");
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.textContent = message || "";
    statusEl.classList.remove("is-error", "is-success");
    if (type === "error") statusEl.classList.add("is-error");
    if (type === "success") statusEl.classList.add("is-success");
  }

  function getTakeImageUrls(take) {
    if (!take) return [];
    if (Array.isArray(take.image_urls) && take.image_urls.length) {
      return take.image_urls.map((url) => String(url || "").trim()).filter(Boolean).slice(0, 2);
    }
    if (take.image_url) {
      const raw = String(take.image_url).trim();
      if (raw.startsWith("[")) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            return parsed.map((url) => String(url || "").trim()).filter(Boolean).slice(0, 2);
          }
        } catch (_error) {
          // Fall back to single URL.
        }
      }
      if (raw) return [raw];
    }
    return [];
  }

  function renderMedia(take) {
    const imageUrls = getTakeImageUrls(take);
    if (!imageUrls.length) return "";

    if (imageUrls.length === 1) {
      return `
        <div class="share-preview__media">
          <img src="${window.ClashlyUtils.escapeHtml(imageUrls[0])}" alt="" decoding="async" />
        </div>
      `;
    }

    return `
      <div class="share-preview__media share-preview__media--split">
        ${imageUrls
          .map(
            (imageUrl, index) => `
              <div class="share-preview__media-slot">
                <img src="${window.ClashlyUtils.escapeHtml(imageUrl)}" alt="Take image ${index + 1}" decoding="async" />
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderPreview(take) {
    const preview = document.getElementById("share-preview");
    if (!preview) return;
    if (!take) {
      preview.innerHTML = `<p class="feed-empty">Take preview unavailable.</p>`;
      return;
    }

    const username = getUsername(take.profile);
    const time = window.ClashlyUtils.formatRelativeTime(take.created_at);
    const media = renderMedia(take);

    preview.innerHTML = `
      <article class="share-preview__card">
        <div class="share-preview__meta">
          ${buildAvatar(take.profile)}
          <div class="share-preview__identity">
            <strong>${window.ClashlyUtils.escapeHtml(username)}</strong>
            <span>${window.ClashlyUtils.escapeHtml(time)}</span>
          </div>
        </div>
        <p class="share-preview__text">${window.ClashlyUtils.escapeHtml(take.content || "")}</p>
        ${media}
      </article>
    `;
  }

  let currentTake = null;

  function updateLinks() {
    const shareUrl = encodeURIComponent(getShareUrl(currentTake));
    const shareText = encodeURIComponent(getShareText(currentTake));
    const xLink = document.querySelector("[data-share-action='x']");
    const facebookLink = document.querySelector("[data-share-action='facebook']");
    const whatsappLink = document.querySelector("[data-share-action='whatsapp']");
    const telegramLink = document.querySelector("[data-share-action='telegram']");
    const redditLink = document.querySelector("[data-share-action='reddit']");
    if (xLink) xLink.href = `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`;
    if (facebookLink) facebookLink.href = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
    if (whatsappLink) whatsappLink.href = `https://wa.me/?text=${shareText}%20${shareUrl}`;
    if (telegramLink) telegramLink.href = `https://t.me/share/url?url=${shareUrl}&text=${shareText}`;
    if (redditLink) redditLink.href = `https://reddit.com/submit?url=${shareUrl}&title=${shareText}`;
  }

  function open(options) {
    ensureModal();
    currentTake = options && options.take ? options.take : null;
    renderPreview(currentTake);
    updateLinks();
    setStatus("", "");

    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function close() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    setStatus("", "");
  }

  async function handleInstagramShare() {
    const shareData = {
      title: "Clashe",
      text: getShareText(currentTake),
      url: getShareUrl(currentTake),
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setStatus("", "");
        close();
        return;
      } catch (error) {
        if (error && error.name === "AbortError") {
          return;
        }
      }
    }

    try {
      await window.ClashlyUtils.copyText(getShareUrl(currentTake));
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
      setStatus("", "");
    } catch (error) {
      setStatus(window.ClashlyUtils.reportError("Instagram share fallback failed.", error, "Could not prepare Instagram share."), "error");
    }
  }

  function bindEvents() {
    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const closeTrigger = target.closest("[data-close-share-modal='true']");
      if (closeTrigger) {
        event.preventDefault();
        close();
        return;
      }

      const action = target.closest("[data-share-action]");
      if (!action) return;

      const actionType = action.getAttribute("data-share-action") || "";
      if (actionType === "copy-link") {
        event.preventDefault();
        try {
          await window.ClashlyUtils.copyText(getShareUrl(currentTake));
          if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
            window.ClashlyUtils.showToast("Link copied to clipboard", "success");
          }
          setStatus("", "");
        } catch (error) {
          setStatus(window.ClashlyUtils.reportError("Copy link failed.", error, "Could not copy link."), "error");
        }
      }

      if (actionType === "instagram") {
        event.preventDefault();
        await handleInstagramShare();
      }
    });

    document.addEventListener("keydown", (event) => {
      const modal = document.getElementById(MODAL_ID);
      if (event.key === "Escape" && modal && !modal.hidden) {
        close();
      }
    });
  }

  bindEvents();

  window.ClashlyShareModal = {
    open,
    close,
  };
})();
