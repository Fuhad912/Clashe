(function () {
  const root = document.documentElement;
  if (!root || root.dataset.clasheLoaderBound === "true") {
    return;
  }

  root.dataset.clasheLoaderBound = "true";

  const isColdBoot = (function () {
    try {
      return !window.sessionStorage.getItem("clashe_app_booted");
    } catch (_e) {
      return true;
    }
  })();

  if (isColdBoot) {
    root.classList.add("clashe-loading");
  }

  const page = document.body ? document.body.dataset.page || "" : "";
  const requiresAuth = document.body ? document.body.dataset.requiresAuth === "true" : false;
  const dataReadyPages = new Set(["auth", "home", "profile", "take", "search", "hashtag", "category", "explore", "notifications"]);
  const MIN_DURATION_MS = 150;
  const DOM_READY_FALLBACK_MS = 400;
  const MAX_DURATION_MS = 6000;
  const EXIT_DURATION_MS = 150;
  const start = Date.now();
  const pendingTokens = new Set();
  let hidden = !isColdBoot;

  if (isColdBoot) {
    if (page === "auth" || requiresAuth) {
      pendingTokens.add("route-guard");
    }

    if (dataReadyPages.has(page)) {
      pendingTokens.add("page-data");
    }
  }

  function ensureLoader() {
    if (!document.body || document.getElementById("clashe-loader")) {
      return;
    }

    document.body.insertAdjacentHTML(
      "afterbegin",
      `
        <div id="clashe-loader" class="clashe-loader" aria-hidden="true">
          <div class="clashe-loader__stack">
            <div class="clashe-loader__mark"></div>
            <div class="clashe-loader__wordmark">Clashe</div>
            <div class="clashe-loader__line"></div>
          </div>
        </div>
      `
    );
  }

  let exitTimer = null;

  function clearLoader() {
    try {
      window.sessionStorage.setItem("clashe_app_booted", "1");
    } catch (_e) {}
    root.classList.remove("clashe-loading");
    root.classList.add("clashe-loader-exit");
    if (exitTimer) window.clearTimeout(exitTimer);
    exitTimer = window.setTimeout(() => {
      root.classList.remove("clashe-loader-exit");
      const loader = document.getElementById("clashe-loader");
      if (loader) loader.remove();
      exitTimer = null;
    }, EXIT_DURATION_MS);
  }

  function hideLoader(token) {
    if (token) {
      pendingTokens.delete(String(token));
      if (pendingTokens.size > 0) return;
    }
    if (hidden) return;
    hidden = true;
    clearLoader();
  }

  function showLoader(token) {
    if (exitTimer) {
      window.clearTimeout(exitTimer);
      exitTimer = null;
    }
    hidden = false;
    if (token) {
      pendingTokens.add(String(token));
    }
    ensureLoader();
    root.classList.remove("clashe-loader-exit");
    root.classList.add("clashe-loading");
  }

  function maybeHideLoader() {
    if (pendingTokens.size > 0) {
      return;
    }

    const elapsed = Date.now() - start;
    const wait = Math.max(0, MIN_DURATION_MS - elapsed);
    if (wait > 0) {
      window.setTimeout(hideLoader, wait);
    } else {
      hideLoader();
    }
  }

  function hold(token) {
    if (!token) return;
    pendingTokens.add(String(token));
  }

  function release(token) {
    if (!token) return;
    pendingTokens.delete(String(token));
    maybeHideLoader();
  }

  window.ClasheLoader = {
    hold,
    release,
    show: showLoader,
    hide: hideLoader,
    markReady(token) {
      release(token || "page-data");
    },
  };

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      if (isColdBoot) {
        ensureLoader();
        if (!pendingTokens.size) {
          window.setTimeout(maybeHideLoader, DOM_READY_FALLBACK_MS);
        }
      }
    },
    { once: true }
  );

  if (isColdBoot && document.body) {
    ensureLoader();
  }

  window.addEventListener(
    "load",
    () => {
      if (isColdBoot && !pendingTokens.size) {
        maybeHideLoader();
      }
    },
    { once: true }
  );

  window.setTimeout(() => {
    pendingTokens.clear();
    hideLoader();
  }, MAX_DURATION_MS);
})();

/* ── Skeleton injection helpers ───────────────────────────── */
(function () {

  /* ── Feed / take skeleton ────────────────────────────────── */
  window.clasheShowFeedSkeleton = function (containerId, count) {
    count = count || 5;
    var container = document.getElementById(containerId);
    if (!container) return;
    var html = "";
    var widths = ["88", "72", "95", "80", "65"];
    for (var i = 0; i < count; i++) {
      var w1 = widths[i % widths.length];
      var w2 = widths[(i + 2) % widths.length];
      html += '<div class="skeleton-take" aria-hidden="true">'
        + '<div class="skeleton-take__avatar skeleton-shimmer"></div>'
        + '<div class="skeleton-take__body">'
          + '<div class="skeleton-take__meta">'
            + '<div class="skeleton-take__username skeleton-shimmer"></div>'
            + '<div class="skeleton-take__time skeleton-shimmer"></div>'
          + '</div>'
          + '<div class="skeleton-take__line skeleton-shimmer" style="width:100%"></div>'
          + '<div class="skeleton-take__line skeleton-shimmer" style="width:' + w1 + '%"></div>'
          + '<div class="skeleton-take__line skeleton-shimmer" style="width:' + w2 + '%"></div>'
          + '<div class="skeleton-take__actions">'
            + '<div class="skeleton-take__action skeleton-shimmer"></div>'
            + '<div class="skeleton-take__action skeleton-shimmer"></div>'
            + '<div class="skeleton-take__action skeleton-shimmer"></div>'
          + '</div>'
        + '</div>'
        + '</div>';
    }
    container.innerHTML = html;
  };

  /* ── Notification skeleton ───────────────────────────────── */
  window.clasheShowNotificationSkeleton = function (containerId, count) {
    count = count || 6;
    var container = document.getElementById(containerId);
    if (!container) return;
    var html = "";
    var lineWidths = [["85%", "60%"], ["70%", "90%"], ["95%", "50%"], ["80%", "75%"]];
    for (var i = 0; i < count; i++) {
      var w1 = lineWidths[i % lineWidths.length][0];
      var w2 = lineWidths[i % lineWidths.length][1];
      html += '<div class="skeleton-notification" aria-hidden="true">'
        + '<div class="skeleton-notification__avatar skeleton-shimmer"></div>'
        + '<div class="skeleton-notification__body">'
          + '<div class="skeleton-line skeleton-shimmer" style="width:' + w1 + '"></div>'
          + '<div class="skeleton-line skeleton-line--sm skeleton-shimmer" style="width:' + w2 + '"></div>'
        + '</div>'
        + '</div>';
    }
    container.innerHTML = html;
  };

  /* ── Search result skeleton ──────────────────────────────── */
  window.clasheShowSearchSkeleton = function (containerId, count) {
    count = count || 5;
    var container = document.getElementById(containerId);
    if (!container) return;
    var html = "";
    var ws = ["65%", "80%", "55%", "90%", "70%"];
    for (var i = 0; i < count; i++) {
      var w = ws[i % ws.length];
      html += '<div class="skeleton-search-result" aria-hidden="true">'
        + '<div class="skeleton-search-result__avatar skeleton-shimmer"></div>'
        + '<div class="skeleton-search-result__body">'
          + '<div class="skeleton-line skeleton-shimmer" style="width:' + w + '"></div>'
          + '<div class="skeleton-line skeleton-line--sm skeleton-shimmer" style="width:50%"></div>'
        + '</div>'
        + '<div class="skeleton-search-result__btn skeleton-shimmer"></div>'
        + '</div>';
    }
    container.innerHTML = html;
  };

  /* ── Profile head skeleton ───────────────────────────────── */
  window.clasheShowProfileSkeleton = function () {
    // Skeleton-ify the static profile-head DOM elements in place.
    // We add a class that hides real content and overlays shimmer.
    var head = document.querySelector(".profile-head");
    if (!head || head.dataset.skeletonApplied) return;
    head.dataset.skeletonApplied = "1";
    head.classList.add("profile-head--skeleton");

    // Avatar
    var avatar = document.getElementById("profile-avatar");
    if (avatar) avatar.classList.add("skeleton-shimmer");

    // Username
    var username = document.getElementById("profile-username");
    if (username) {
      username.dataset.origText = username.textContent;
      username.textContent = "";
      username.classList.add("skeleton-line", "skeleton-line--lg", "skeleton-shimmer", "skeleton-text-block");
    }

    // Bio
    var bio = document.getElementById("profile-bio");
    if (bio) {
      bio.dataset.origText = bio.textContent;
      bio.textContent = "";
      bio.classList.add("skeleton-shimmer", "skeleton-bio-block");
    }

    // Stats
    ["takes-count", "followers-count", "following-count"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add("skeleton-shimmer", "skeleton-stat-block");
    });

    // Action buttons
    var actions = document.querySelector(".profile-head__actions");
    if (actions) actions.classList.add("profile-head__actions--skeleton");
  };

  window.clasheRemoveProfileSkeleton = function () {
    var head = document.querySelector(".profile-head");
    if (!head || !head.dataset.skeletonApplied) return;
    delete head.dataset.skeletonApplied;
    head.classList.remove("profile-head--skeleton");

    var avatar = document.getElementById("profile-avatar");
    if (avatar) avatar.classList.remove("skeleton-shimmer");

    var username = document.getElementById("profile-username");
    if (username) {
      username.classList.remove("skeleton-line", "skeleton-line--lg", "skeleton-shimmer", "skeleton-text-block");
    }

    var bio = document.getElementById("profile-bio");
    if (bio) {
      bio.classList.remove("skeleton-shimmer", "skeleton-bio-block");
    }

    ["takes-count", "followers-count", "following-count"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove("skeleton-shimmer", "skeleton-stat-block");
    });

    var actions = document.querySelector(".profile-head__actions");
    if (actions) actions.classList.remove("profile-head__actions--skeleton");
  };

  /* ── Follow-list skeleton ────────────────────────────────── */
  window.clasheShowFollowListSkeleton = function (containerId, count) {
    count = count || 6;
    var container = document.getElementById(containerId);
    if (!container) return;
    var html = "";
    var bioWidths = ["60%", "80%", "50%", "70%", "65%", "75%"];
    for (var i = 0; i < count; i++) {
      var bw = bioWidths[i % bioWidths.length];
      html += '<div class="skeleton-follow-item" aria-hidden="true">'
        + '<div class="skeleton-follow-item__avatar skeleton-shimmer"></div>'
        + '<div class="skeleton-follow-item__body">'
          + '<div class="skeleton-line skeleton-shimmer" style="width:55%"></div>'
          + '<div class="skeleton-line skeleton-line--sm skeleton-shimmer" style="width:' + bw + '"></div>'
        + '</div>'
        + '<div class="skeleton-follow-item__btn skeleton-shimmer"></div>'
        + '</div>';
    }
    container.innerHTML = html;
  };

  /* ── Explore categories skeleton ─────────────────────────── */
  window.clasheShowExploreSkeleton = function (containerId, count) {
    count = count || 4;
    var container = document.getElementById(containerId);
    if (!container) return;
    var html = "";
    for (var i = 0; i < count; i++) {
      html += '<div class="skeleton-explore-card" aria-hidden="true">'
        + '<div class="skeleton-explore-card__header">'
          + '<div class="skeleton-line skeleton-line--sm skeleton-shimmer" style="width:30%"></div>'
          + '<div class="skeleton-line skeleton-line--lg skeleton-shimmer" style="width:65%"></div>'
          + '<div class="skeleton-line skeleton-shimmer" style="width:90%"></div>'
          + '<div class="skeleton-line skeleton-shimmer" style="width:75%"></div>'
        + '</div>'
        + '<div class="skeleton-explore-card__chips">'
          + '<div class="skeleton-chip skeleton-shimmer"></div>'
          + '<div class="skeleton-chip skeleton-shimmer"></div>'
          + '<div class="skeleton-chip skeleton-shimmer"></div>'
        + '</div>'
        + '</div>';
    }
    container.innerHTML = html;
  };

  /* ── Trending topics skeleton ────────────────────────────── */
  window.clasheShowTrendingSkeleton = function (containerId, count) {
    count = count || 4;
    var container = document.getElementById(containerId);
    if (!container) return;
    var html = "";
    for (var i = 0; i < count; i++) {
      html += '<div class="skeleton-trend-item" aria-hidden="true">'
        + '<div class="skeleton-line skeleton-line--sm skeleton-shimmer" style="width:28%;margin-bottom:6px"></div>'
        + '<div class="skeleton-line skeleton-line--lg skeleton-shimmer" style="width:48%;margin-bottom:6px"></div>'
        + '<div class="skeleton-line skeleton-line--sm skeleton-shimmer" style="width:20%"></div>'
        + '</div>';
    }
    container.innerHTML = html;
    container.hidden = false;
  };

  /* ── Comment skeleton ─────────────────────────────────────── */
  window.clasheShowCommentsSkeleton = function (containerIdOrEl, count) {
    count = count || 4;
    var container = typeof containerIdOrEl === "string" ? document.getElementById(containerIdOrEl) : containerIdOrEl;
    if (!container) return;
    var html = "";
    var configs = [
      { w1: "90%", w2: "65%", isReply: false },
      { w1: "78%", w2: "", isReply: true },
      { w1: "95%", w2: "80%", isReply: false },
      { w1: "70%", w2: "", isReply: false },
    ];
    for (var i = 0; i < count; i++) {
      var cfg = configs[i % configs.length];
      var replyClass = cfg.isReply ? " skeleton-comment--reply" : "";
      html += '<div class="skeleton-comment' + replyClass + '" aria-hidden="true">'
        + '<div class="skeleton-comment__avatar skeleton-shimmer"></div>'
        + '<div class="skeleton-comment__body">'
          + '<div class="skeleton-comment__meta">'
            + '<div class="skeleton-comment__user skeleton-shimmer"></div>'
            + '<div class="skeleton-comment__dot"></div>'
            + '<div class="skeleton-comment__time skeleton-shimmer"></div>'
          + '</div>'
          + '<div class="skeleton-comment__line skeleton-shimmer" style="width:100%"></div>'
          + (cfg.w1 ? '<div class="skeleton-comment__line skeleton-shimmer" style="width:' + cfg.w1 + '"></div>' : '')
          + (cfg.w2 ? '<div class="skeleton-comment__line skeleton-shimmer" style="width:' + cfg.w2 + '"></div>' : '')
          + '<div class="skeleton-comment__actions">'
            + '<div class="skeleton-comment__action skeleton-shimmer"></div>'
            + '<div class="skeleton-comment__action skeleton-shimmer"></div>'
          + '</div>'
        + '</div>'
        + '</div>';
    }
    container.innerHTML = html;
    container.hidden = false;
  };

  /* ── Helper: hide a feed-state element while skeleton shows  */
  window.clasheHideStateEl = function (id) {
    var el = document.getElementById(id);
    if (el) el.hidden = true;
  };

})();
