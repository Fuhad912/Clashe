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
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      `,
      whatsapp: `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.1-.476-.15-.677.15-.2.3-.777.978-.952 1.179-.175.2-.351.226-.652.075s-1.272-.469-2.423-1.496c-.896-.799-1.5-1.787-1.676-2.088-.175-.301-.019-.464.132-.614.135-.135.301-.351.451-.527.15-.175.2-.301.3-.501.1-.2.05-.376-.025-.527-.075-.15-.677-1.63-.928-2.232-.244-.585-.492-.505-.677-.515-.175-.008-.376-.01-.577-.01-.2 0-.526.075-.802.376-.276.3-1.053 1.028-1.053 2.507 0 1.479 1.078 2.908 1.228 3.109.15.2 2.121 3.24 5.138 4.542.718.31 1.279.495 1.716.634.721.229 1.377.197 1.896.12.578-.087 1.78-.727 2.031-1.429.251-.702.251-1.303.175-1.429-.075-.125-.276-.2-.577-.35z"/>
          <path d="M12.004 2c-5.52 0-10 4.48-10 10 0 1.765.46 3.424 1.264 4.869L2 22l5.304-1.233A9.957 9.957 0 0012.004 22c5.52 0 10-4.48 10-10s-4.48-10-10-10zm0 18.2a8.17 8.17 0 01-4.17-1.135l-.299-.178-3.097.72.825-3.018-.195-.312A8.187 8.187 0 013.8 12c0-4.526 3.678-8.204 8.204-8.204 4.526 0 8.204 3.678 8.204 8.204 0 4.526-3.678 8.2-8.204 8.2z"/>
        </svg>
      `,
      telegram: `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
          <path d="M21.6 3.6a1.2 1.2 0 0 0-1.28-.24L2.8 10.32a1.2 1.2 0 0 0-.06 2.26l5.24 1.95 2.02 5.88a1.2 1.2 0 0 0 2.1.32l2.92-3.14 4.88 3.58a1.2 1.2 0 0 0 1.88-.72l3.2-16a1.2 1.2 0 0 0-.38-.85zM8.88 13.34l9.28-7.86-7.8 8.84-.36 3.32-1.12-4.3z"/>
        </svg>
      `,
      instagram: `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      `,
      reddit: `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
        </svg>
      `,
      facebook: `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      `,
      copy: `
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </header>

          <section id="share-preview" class="share-preview"></section>
          <p class="share-modal__copy">Push this take into another room. Send the link where the debate will travel fastest.</p>
          <p id="share-modal-status" class="feed-state" hidden></p>

          <div class="share-actions">
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
            <button type="button" class="share-action" data-share-action="copy-link">
              <span class="share-action__orb share-action__orb--copy">${renderPlatformIcon("copy")}</span>
              <span class="share-action__label">Link</span>
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
