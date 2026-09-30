(function () {
  const page = document.body.dataset.page || "";
  const topNavEl = document.getElementById("top-nav");
  const bottomNavEl = document.getElementById("bottom-nav");
  const CREATE_EVENT = "clashly:take-created";
  const CREATE_MODAL_ID = "create-modal";
  const ONBOARDING_MODAL_ID = "onboarding-modal";
  const ONBOARDING_STORAGE_KEY_PREFIX = "clashe-onboarding-seen";
  const DEFAULT_PREVIEW_TEXT = "Image preview area";
  const NOTIFICATIONS_DRAWER_ID = "notifications-drawer";
  const DESKTOP_NOTIFICATIONS_QUERY = "(min-width: 1025px)";
  const SERVICE_WORKER_PATH = "sw.js";
  const PWA_STATE_EVENT = "clashly:pwa-state";
  const ONBOARDING_ENABLED_PAGES = new Set([
    "home",
    "explore",
    "search",
    "notifications",
    "profile",
    "settings",
    "take",
    "category",
    "hashtag",
    "create",
  ]);
  let bottomNavResizeObserver = null;
  let notificationsUserId = "";
  let notificationsItems = [];
  let notificationWatcherUserId = "";
  let notificationWatcherTimer = null;
  let notificationRefreshPromise = null;
  let notificationBannerTimer = null;
  const seenNotificationIdsByUser = new Map();
  const NOTIFICATION_SEEN_PREFIX = "clashe-notification-banner-seen:";
  let onboardingActiveUserId = "";
  let onboardingShownForUserId = "";
  let deferredInstallPrompt = null;
  let createModalSelectedFiles = [];
  let createModalCategoryPicker = null;
  let installPromptConsumed = false;
  let serviceWorkerRegistration = null;
  let pwaInitialized = false;
  const pwaSubscribers = new Set();
  const pwaState = {
    supported: typeof window !== "undefined" && "serviceWorker" in navigator,
    canInstall: false,
    installed: false,
    promptOutcome: "",
    serviceWorkerReady: false,
    secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    promptCaptured: false,
  };

  const desktopLinks = [
    { id: "home", label: "Home", href: "index.html" },
    { id: "search", label: "Search", href: "search.html" },
    { id: "notifications", label: "Notifications", href: "notifications.html" },
    { id: "create", label: "Create", href: "create.html", opensModal: true },
    { id: "profile", label: "Profile", href: "profile.html" },
    { id: "settings", label: "Settings", href: "settings.html" },
  ];

  const mobileLinks = [
    { id: "home", label: "Home", href: "index.html" },
    { id: "search", label: "Search", href: "search.html" },
    { id: "notifications", label: "Notifications", href: "notifications.html" },
    { id: "profile", label: "Profile", href: "profile.html" },
    { id: "create", label: "Create", href: "create.html", opensModal: true },
  ];

  function isStandaloneDisplayMode() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.navigator.standalone === true
    );
  }

  function emitPwaState() {
    const snapshot = { ...pwaState };
    pwaSubscribers.forEach((subscriber) => {
      try {
        subscriber(snapshot);
      } catch (error) {
        console.error("[Clashe] PWA subscriber failed.", error);
      }
    });
    window.dispatchEvent(
      new CustomEvent(PWA_STATE_EVENT, {
        detail: snapshot,
      })
    );
  }

  function updatePwaState(patch) {
    Object.assign(pwaState, patch || {});
    emitPwaState();
  }

  function getPwaState() {
    return { ...pwaState };
  }

  function subscribePwaState(callback) {
    if (typeof callback !== "function") {
      return function noop() {};
    }
    pwaSubscribers.add(callback);
    callback(getPwaState());
    return function unsubscribe() {
      pwaSubscribers.delete(callback);
    };
  }

  async function promptPwaInstall() {
    if (pwaState.installed) {
      return {
        status: "installed",
        outcome: "accepted",
      };
    }

    if (!deferredInstallPrompt || installPromptConsumed) {
      updatePwaState({
        canInstall: false,
        promptCaptured: false,
      });
      return {
        status: "unavailable",
        outcome: "",
      };
    }

    const savedPrompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    installPromptConsumed = true;
    updatePwaState({
      canInstall: false,
      promptOutcome: "",
    });

    try {
      await savedPrompt.prompt();
      const userChoice = await savedPrompt.userChoice;
      const outcome = userChoice && userChoice.outcome === "accepted" ? "accepted" : "dismissed";
      updatePwaState({
        promptOutcome: outcome,
      });
      return {
        status: outcome,
        outcome,
      };
    } catch (error) {
      console.error("[Clashe] Install prompt failed.", error);
      updatePwaState({
        promptOutcome: "dismissed",
      });
      return {
        status: "error",
        outcome: "",
      };
    }
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      updatePwaState({
        serviceWorkerReady: false,
      });
      return null;
    }

    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
        scope: "./",
      });
      updatePwaState({
        serviceWorkerReady: true,
      });
      return serviceWorkerRegistration;
    } catch (error) {
      console.error("[Clashe] Service worker registration failed.", error);
      updatePwaState({
        serviceWorkerReady: false,
      });
      return null;
    }
  }

  function applyInstallPrompt(event) {
    if (isStandaloneDisplayMode()) {
      updatePwaState({ installed: true, canInstall: false, promptCaptured: false });
      return;
    }
    deferredInstallPrompt = event;
    installPromptConsumed = false;
    updatePwaState({
      supported: true,
      installed: false,
      canInstall: true,
      promptOutcome: "",
      secureContext: window.isSecureContext,
      promptCaptured: true,
    });
  }

  function bindPwaInstallEvents() {
    updatePwaState({
      installed: isStandaloneDisplayMode(),
      canInstall: false,
      promptOutcome: "",
      secureContext: window.isSecureContext,
      promptCaptured: false,
    });

    // Pick up prompt that pwa-capture.js already caught before this code ran.
    if (window.__pwaInstallPrompt && !window.__pwaInstallConsumed) {
      applyInstallPrompt(window.__pwaInstallPrompt);
    }

    // Relay from pwa-capture.js (fires whether app.js loaded before or after).
    window.addEventListener("clashly:install-prompt-ready", function (ev) {
      applyInstallPrompt(ev.detail);
    });

    // Safety net: direct listener in case pwa-capture.js didn't load first.
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      applyInstallPrompt(event);
    });

    window.addEventListener("clashly:app-installed", function () {
      deferredInstallPrompt = null;
      installPromptConsumed = true;
      updatePwaState({ installed: true, canInstall: false, promptOutcome: "accepted", promptCaptured: false });
    });

    window.addEventListener("appinstalled", function () {
      deferredInstallPrompt = null;
      installPromptConsumed = true;
      updatePwaState({ installed: true, canInstall: false, promptOutcome: "accepted", promptCaptured: false });
    });
  }

  function initPwa() {
    if (pwaInitialized) return;
    pwaInitialized = true;
    bindPwaInstallEvents();
    registerServiceWorker().catch(() => {});
  }

  function shouldUseCreateModal() {
    return page !== "auth" && page !== "profile-setup" && page !== "create";
  }

  function shouldUseNotificationsDrawer() {
    return page !== "auth" && page !== "profile-setup" && page !== "notifications";
  }

  function shouldUseOnboardingModal() {
    return ONBOARDING_ENABLED_PAGES.has(page);
  }

  function isDesktopViewport() {
    return window.matchMedia(DESKTOP_NOTIFICATIONS_QUERY).matches;
  }

  function resolveActiveNavLink(id) {
    if (page === "take" || page === "home" || page === "hashtag") return id === "home";
    if (page === "search" || page === "explore" || page === "category") return id === "search";
    return id === page;
  }

  function renderIcon(id) {
    const icons = {
      home: `
        <i class="app-icon fa-solid fa-house" aria-hidden="true"></i>
      `,
      explore: `
        <i class="app-icon fa-solid fa-compass" aria-hidden="true"></i>
      `,
      search: `
        <i class="app-icon fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      `,
      notifications: `
        <i class="app-icon fa-regular fa-bell" aria-hidden="true"></i>
      `,
      create: `
        <i class="app-icon fa-solid fa-plus" aria-hidden="true"></i>
      `,
      profile: `
        <i class="app-icon fa-regular fa-user" aria-hidden="true"></i>
      `,
      settings: `
        <i class="app-icon fa-solid fa-gear" aria-hidden="true"></i>
      `,
    };

    return icons[id] || icons.home;
  }

  function buildDesktopLink(link) {
    const activeClass = resolveActiveNavLink(link.id) ? "is-active" : "";
    const modalAttr = link.opensModal && shouldUseCreateModal() ? ' data-open-create-modal="true"' : "";
    const notificationsAttr =
      link.id === "notifications" && shouldUseNotificationsDrawer() ? ' data-open-notifications-drawer="true"' : "";
    const unreadMarker =
      link.id === "notifications"
        ? '<span class="nav-unread-dot" id="desktop-notifications-dot" hidden aria-hidden="true"></span>'
        : "";

    return `
      <li>
        <a class="desktop-nav__link ${activeClass}" href="${link.href}"${modalAttr}${notificationsAttr}${activeClass ? ' aria-current="page"' : ""}>
          <span class="desktop-nav__icon desktop-nav__icon--${link.id}">${renderIcon(link.id)}${unreadMarker}</span>
          <span class="desktop-nav__label">${link.label}</span>
        </a>
      </li>
    `;
  }

  function buildMobileLink(link) {
    const activeClass = resolveActiveNavLink(link.id) ? "is-active" : "";
    const isCreate = link.id === "create";
    const createClass = isCreate ? " bottom-nav__link--create" : "";
    const modalAttr = link.opensModal && shouldUseCreateModal() ? ' data-open-create-modal="true"' : "";
    const unreadMarker =
      link.id === "notifications"
        ? '<span class="nav-unread-dot" id="mobile-notifications-dot" hidden aria-hidden="true"></span>'
        : "";
    const labelHtml = isCreate
      ? ""
      : link.id === "notifications"
      ? '<span class="bottom-nav__label"><span class="bottom-nav__label-long">Notifications</span><span class="bottom-nav__label-short">Alerts</span></span>'
      : `<span class="bottom-nav__label">${link.label}</span>`;
    return `
      <a class="bottom-nav__link ${activeClass}${createClass}" href="${link.href}"${modalAttr}${activeClass ? ' aria-current="page"' : ""} aria-label="${link.label}">
        <span class="bottom-nav__icon bottom-nav__icon--${link.id}" aria-hidden="true">${renderIcon(link.id)}${unreadMarker}</span>
        ${labelHtml}
      </a>
    `;
  }
  let activeNotificationsSubscription = null;

  function getSeenNotificationIds(userId) {
    if (seenNotificationIdsByUser.has(userId)) return seenNotificationIdsByUser.get(userId);
    try {
      const stored = JSON.parse(sessionStorage.getItem(`${NOTIFICATION_SEEN_PREFIX}${userId}`) || "null");
      const ids = Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : null;
      if (ids) seenNotificationIdsByUser.set(userId, ids);
      return ids;
    } catch (_) {
      return null;
    }
  }

  function saveSeenNotificationIds(userId, ids) {
    const seen = [...new Set(ids)].slice(0, 50);
    seenNotificationIdsByUser.set(userId, seen);
    try {
      sessionStorage.setItem(`${NOTIFICATION_SEEN_PREFIX}${userId}`, JSON.stringify(seen));
    } catch (_) {}
  }

  function dismissNotificationBanner() {
    window.clearTimeout(notificationBannerTimer);
    const banner = document.getElementById("notification-banner");
    if (banner) banner.remove();
  }

  function showNotificationBanner(item, count) {
    if (document.hidden || document.body.classList.contains("has-onboarding-open") ||
      (window.ClashlyPush && window.ClashlyPush.isActiveOnThisDevice())) return;
    dismissNotificationBanner();
    const banner = document.createElement("div");
    banner.id = "notification-banner";
    banner.className = "notification-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");

    const icon = document.createElement("span");
    icon.className = "notification-banner__icon";
    icon.setAttribute("aria-hidden", "true");
    const iconClass = {
      follow: "fa-user-plus", comment: "fa-comment", reply: "fa-reply",
      bookmark: "fa-bookmark", comment_like: "fa-heart",
    }[item.type] || "fa-bell";
    icon.innerHTML = `<i class="app-icon fa-solid ${iconClass}" aria-hidden="true"></i>`;

    const link = document.createElement("a");
    link.className = "notification-banner__link";
    try {
      const target = new URL(item.href || "notifications.html", window.location.href);
      link.href = target.origin === window.location.origin ? target.href : "notifications.html";
    } catch (_) {
      link.href = "notifications.html";
    }
    const heading = document.createElement("span");
    heading.className = "notification-banner__heading";
    heading.textContent = count > 1 ? `${count} new notifications` : "New notification";
    const message = document.createElement("span");
    message.className = "notification-banner__message";
    message.textContent = item.message || "You have a new notification.";
    link.append(heading, message);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "notification-banner__close";
    close.setAttribute("aria-label", "Dismiss notification banner");
    close.innerHTML = '<i class="app-icon fa-solid fa-xmark" aria-hidden="true"></i>';
    close.addEventListener("click", dismissNotificationBanner);
    banner.append(icon, link, close);
    const scheduleDismiss = () => {
      window.clearTimeout(notificationBannerTimer);
      notificationBannerTimer = window.setTimeout(dismissNotificationBanner, 6500);
    };
    banner.addEventListener("pointerenter", () => window.clearTimeout(notificationBannerTimer));
    banner.addEventListener("pointerleave", scheduleDismiss);
    banner.addEventListener("focusin", () => window.clearTimeout(notificationBannerTimer));
    banner.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (!banner.contains(document.activeElement)) scheduleDismiss();
      }, 0);
    });
    document.body.appendChild(banner);
    scheduleDismiss();
  }

  async function refreshNotificationBanners(userId) {
    if (!userId || !window.ClashlyNotifications || document.hidden) return;
    if (notificationRefreshPromise) return notificationRefreshPromise;
    const refresh = (async () => {
      const result = await window.ClashlyNotifications.fetchNotifications(userId, { limit: 25, fresh: true });
      if (result.error || notificationWatcherUserId !== userId) return;
      const items = result.notifications || [];
      const previousIds = getSeenNotificationIds(userId);
      const previousSet = new Set(previousIds || []);
      const newItems = previousIds === null ? [] : items.filter((item) => !item.is_read && !previousSet.has(String(item.id)));
      saveSeenNotificationIds(userId, items.map((item) => String(item.id)).concat(previousIds || []));
      if (page !== "notifications") updateNavNotificationBadges(items.some((item) => !item.is_read));
      if (newItems.length) showNotificationBanner(newItems[0], newItems.length);
    })().catch(() => {}).finally(() => {
      if (notificationRefreshPromise === refresh) notificationRefreshPromise = null;
    });
    notificationRefreshPromise = refresh;
    return refresh;
  }

  function stopNotificationWatcher() {
    if (notificationWatcherTimer) window.clearInterval(notificationWatcherTimer);
    notificationWatcherTimer = null;
    if (activeNotificationsSubscription && window.ClashlySupabase) {
      const client = window.ClashlySupabase.getClient();
      if (client && typeof client.removeChannel === "function") client.removeChannel(activeNotificationsSubscription);
    }
    activeNotificationsSubscription = null;
    notificationWatcherUserId = "";
    notificationRefreshPromise = null;
    dismissNotificationBanner();
  }

  function startNotificationWatcher(userId) {
    if (notificationWatcherUserId === userId) return;
    stopNotificationWatcher();
    notificationWatcherUserId = userId;
    Promise.resolve(refreshNotificationBanners(userId)).finally(() => {
      if (notificationWatcherUserId === userId) initRealtimeNotifications(userId);
    });
    notificationWatcherTimer = window.setInterval(() => {
      if (!document.hidden) refreshNotificationBanners(userId);
    }, 30000);
  }

  function updateNavNotificationBadges(hasUnread) {
    const desktopDot = document.getElementById("desktop-notifications-dot");
    const mobileDot = document.getElementById("mobile-notifications-dot");

    [desktopDot, mobileDot].forEach((dot) => {
      if (!dot) return;
      if (hasUnread) {
        dot.hidden = false;
        requestAnimationFrame(() => dot.classList.add("is-visible"));
      } else {
        dot.classList.remove("is-visible");
        dot.hidden = true;
      }
    });
  }

  async function checkNavNotifications(userId) {
    if (!userId || !window.ClashlyNotifications) return;
    if (page === "notifications") {
      updateNavNotificationBadges(false);
      return;
    }

    try {
      const result = await window.ClashlyNotifications.fetchUnreadCount(userId);
      const hasUnread = Boolean(result && result.count > 0);
      updateNavNotificationBadges(hasUnread);
    } catch (_) {}
  }

  function initRealtimeNotifications(userId) {
    if (!userId || !window.ClashlySupabase || activeNotificationsSubscription) return;
    const client = window.ClashlySupabase.getClient();
    if (!client || typeof client.channel !== "function") return;

    try {
      activeNotificationsSubscription = client
        .channel(`nav-notifs-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            if (page !== "notifications") {
              updateNavNotificationBadges(true);
            }
            refreshNotificationBanners(userId);
          }
        )
        .subscribe();
    } catch (_) {}
  }


  function buildTopNav() {
    if (!topNavEl) return;

    topNavEl.innerHTML = `
      <div class="top-nav__inner">
        <a class="brand" href="index.html" aria-label="Clashe home">
          <span class="brand__mark" aria-hidden="true">
            <img src="assets/Lightmode_logo.svg" alt="Clashe" class="theme-logo theme-logo--light" />
            <img src="assets/Darkmode_logo.svg" alt="Clashe" class="theme-logo theme-logo--dark" />
          </span>
          <span>Clashe</span>
        </a>
        <nav class="desktop-nav" aria-label="Primary navigation">
          <ul class="desktop-nav__list">
            ${desktopLinks.map(buildDesktopLink).join("")}
          </ul>
        </nav>
      </div>
    `;
  }

  function buildBottomNav() {
    if (!bottomNavEl) return;
    bottomNavEl.innerHTML = `
      <div class="bottom-nav__frame">
        <div class="bottom-nav__inner">
          <span class="bottom-nav__active-pill" aria-hidden="true"></span>
          ${mobileLinks.filter((link) => link.id !== "create").map(buildMobileLink).join("")}
        </div>
        ${mobileLinks.filter((link) => link.id === "create").map(buildMobileLink).join("")}
      </div>
    `;
    positionBottomNavPill();
    if (typeof ResizeObserver === "function") {
      if (bottomNavResizeObserver) bottomNavResizeObserver.disconnect();
      bottomNavResizeObserver = new ResizeObserver(positionBottomNavPill);
      bottomNavResizeObserver.observe(bottomNavEl.querySelector(".bottom-nav__frame"));
    }
    bindBottomNavTapFeedback();
    // A safety re-measure one frame later, in case web fonts finish
    // loading and shift the nav's layout right after this first paint.
    window.requestAnimationFrame(positionBottomNavPill);
  }

  // Positions the shared sliding pill behind whichever tab is marked
  // .is-active (set server-side per page in buildMobileLink), so on load it
  // appears already in the right spot, then animates smoothly if a script
  // re-renders the nav later in the same page view. The create button is
  // its own raised glass slab and never sits behind this pill.
  function positionBottomNavPill() {
    if (!bottomNavEl) return;
    const inner = bottomNavEl.querySelector(".bottom-nav__inner");
    const pill = bottomNavEl.querySelector(".bottom-nav__active-pill");
    const activeLink = bottomNavEl.querySelector(".bottom-nav__link.is-active:not(.bottom-nav__link--create)");
    if (!inner || !pill) return;

    const dockHeight = bottomNavEl.querySelector(".bottom-nav__frame").getBoundingClientRect().height;
    if (dockHeight > 0) {
      document.documentElement.style.setProperty("--mobile-nav-clearance", `${Math.ceil(dockHeight) + 24}px`);
    }

    if (!activeLink) {
      pill.style.width = "0";
      return;
    }

    const innerRect = inner.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const offsetX = linkRect.left - innerRect.left - inner.clientLeft;
    pill.style.width = `${linkRect.width}px`;
    pill.style.transform = `translateX(${offsetX}px)`;
  }

  // Real cross-tab navigation is a full page load (see the view-transition
  // notes in layout.css for why), so the only animation achievable entirely
  // within this page view is instant tap feedback the moment someone taps —
  // a quick press-down on the icon — before the browser hands off to the
  // next page.
  function bindBottomNavTapFeedback() {
    if (!bottomNavEl || bottomNavEl.dataset.tapFeedbackBound === "1") return;
    bottomNavEl.dataset.tapFeedbackBound = "1";

    bottomNavEl.addEventListener(
      "pointerdown",
      (event) => {
        const link = event.target instanceof Element ? event.target.closest(".bottom-nav__link") : null;
        if (!link) return;
        link.classList.add("is-pressed");
      },
      { passive: true }
    );

    bottomNavEl.addEventListener("pointercancel", () => {
      bottomNavEl.querySelectorAll(".bottom-nav__link.is-pressed").forEach((link) => link.classList.remove("is-pressed"));
    });

    bottomNavEl.addEventListener("pointerup", () => {
      bottomNavEl.querySelectorAll(".bottom-nav__link.is-pressed").forEach((link) => {
        link.classList.remove("is-pressed");
      });
    });

    bottomNavEl.addEventListener("pointerleave", () => {
      bottomNavEl.querySelectorAll(".bottom-nav__link.is-pressed").forEach((link) => {
        link.classList.remove("is-pressed");
      });
    }, true);
  }

  window.addEventListener("resize", () => {
    if (bottomNavEl) positionBottomNavPill();
  });

  function shouldShowLegalFooter() {
    return page !== "auth";
  }

  function getLegalFooterMarkup() {
    return `
      <footer id="app-legal-footer" class="app-legal-footer" aria-label="Legal links">
        <a href="terms.html">Terms of Service</a>
        <span aria-hidden="true">•</span>
        <a href="privacy.html">Privacy Policy</a>
      </footer>
    `;
  }

  function buildLegalFooter() {
    if (!shouldShowLegalFooter() || document.getElementById("app-legal-footer")) return;

    if (bottomNavEl && bottomNavEl.parentNode) {
      bottomNavEl.insertAdjacentHTML("beforebegin", getLegalFooterMarkup());
      return;
    }

    document.body.insertAdjacentHTML("beforeend", getLegalFooterMarkup());
  }

  async function handleLogout() {
    if (!window.ClashlyAuth) return;

    try {
      if (window.ClashlyPush) await window.ClashlyPush.disable().catch(() => {});

      if (window.ClasheCache) {
        window.ClasheCache.clearAll();
      }
      if (window.ClashlyTakeRenderer && typeof window.ClashlyTakeRenderer.clearCache === "function") {
        window.ClashlyTakeRenderer.clearCache();
      }
      if (window.ClashlyProfiles && typeof window.ClashlyProfiles.clearProfileCache === "function") {
        window.ClashlyProfiles.clearProfileCache();
      }

      const { error } = await window.ClashlyAuth.signOut();
      if (error) {
        console.error("[Clashly] Logout failed.", error);
        return;
      }

      if (window.ClasheCache) {
        window.ClasheCache.clearAll();
      }
      if (window.ClashlyTakeRenderer && typeof window.ClashlyTakeRenderer.clearCache === "function") {
        window.ClashlyTakeRenderer.clearCache();
      }
      if (window.ClashlyProfiles && typeof window.ClashlyProfiles.clearProfileCache === "function") {
        window.ClashlyProfiles.clearProfileCache();
      }

      window.location.replace("auth.html");
    } catch (error) {
      console.error("[Clashly] Logout failed.", error);
    }
  }

  function setLogoutVisibility(isVisible) {
    const logoutButtons = [document.getElementById("nav-logout-btn"), document.getElementById("logout-trigger")];
    logoutButtons.forEach((logoutBtn) => {
      if (!logoutBtn) return;
      logoutBtn.classList.toggle("is-hidden", !isVisible);
    });
  }

  function getOnboardingStorageKey(userId) {
    return `${ONBOARDING_STORAGE_KEY_PREFIX}:${userId}`;
  }

  function hasSeenOnboardingLocally(userId) {
    if (!userId) return false;
    try {
      return window.localStorage.getItem(getOnboardingStorageKey(userId)) === "1";
    } catch (_error) {
      return false;
    }
  }

  function setSeenOnboardingLocally(userId) {
    if (!userId) return;
    try {
      window.localStorage.setItem(getOnboardingStorageKey(userId), "1");
    } catch (_error) {
      // Ignore storage access failures.
    }
  }

  async function hasSeenOnboarding(userId) {
    if (!userId) return true;
    // Fast path: already cached locally on this device.
    if (hasSeenOnboardingLocally(userId)) return true;
    // Slow path: check the database so returning users on new browsers
    // are not shown the modal again.
    if (window.ClashlyProfiles) {
      try {
        const { seen } = await window.ClashlyProfiles.hasSeenOnboardingInDb(userId);
        if (seen) {
          // Cache locally so future checks are instant.
          setSeenOnboardingLocally(userId);
          return true;
        }
      } catch (_err) {
        // Network error — fall through and show modal (safe default).
      }
    }
    return false;
  }

  function markOnboardingSeen(userId) {
    if (!userId) return;
    setSeenOnboardingLocally(userId);
    // Write to DB in the background — don't block the UI.
    if (window.ClashlyProfiles) {
      window.ClashlyProfiles.markOnboardingSeenInDb(userId).catch(() => {});
    }
  }

  function getOnboardingModalMarkup() {
    return `
      <div id="${ONBOARDING_MODAL_ID}" class="onboarding-modal" hidden>
        <button
          type="button"
          class="onboarding-modal__backdrop"
          aria-label="Close onboarding guide"
          data-close-onboarding="true"
        ></button>
        <section class="onboarding-modal__panel" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
          <header class="onboarding-modal__head">
            <button
              type="button"
              class="onboarding-modal__close"
              aria-label="Close onboarding guide"
              data-close-onboarding="true"
            >
              X
            </button>
            <div class="onboarding-modal__intro">
              <p class="onboarding-modal__kicker">Welcome to Clashe</p>
              <h2 id="onboarding-title" class="onboarding-modal__title">Quick start guide</h2>
            </div>
          </header>
          <p class="onboarding-modal__copy">
            Clashe is built for sharp takes and clear debate. Here is how to get started.
          </p>
          <ul class="onboarding-modal__list">
            <li>
              <strong>Post your take</strong>
              <span>Share one clear opinion to start a focused discussion.</span>
            </li>
            <li>
              <strong>Vote and discuss</strong>
              <span>Use agree/disagree and comments to push arguments forward.</span>
            </li>
            <li>
              <strong>Follow the best thinkers</strong>
              <span>Build a feed around people and topics you care about.</span>
            </li>
          </ul>
          <footer class="onboarding-modal__actions">
            <button type="button" class="btn btn--primary" data-close-onboarding="true">Start exploring</button>
          </footer>
        </section>
      </div>
    `;
  }

  function buildOnboardingModal() {
    if (!shouldUseOnboardingModal() || document.getElementById(ONBOARDING_MODAL_ID)) return;
    document.body.insertAdjacentHTML("beforeend", getOnboardingModalMarkup());
  }

  function getOnboardingModal() {
    return document.getElementById(ONBOARDING_MODAL_ID);
  }

  function openOnboardingModal(userId) {
    const modal = getOnboardingModal();
    if (!modal || !userId) return;
    onboardingActiveUserId = userId;
    modal.hidden = false;
    document.body.classList.add("has-onboarding-open");
  }

  function closeOnboardingModal(options = {}) {
    const modal = getOnboardingModal();
    if (!modal) return;
    const shouldMarkSeen = options.markSeen !== false;
    modal.hidden = true;
    document.body.classList.remove("has-onboarding-open");
    if (shouldMarkSeen && onboardingActiveUserId) {
      markOnboardingSeen(onboardingActiveUserId);
    }
    onboardingActiveUserId = "";
  }

  async function maybeShowOnboarding(userId) {
    if (!shouldUseOnboardingModal() || !userId) return;
    if (onboardingShownForUserId === userId) return;

    onboardingShownForUserId = userId;
    const seen = await hasSeenOnboarding(userId);
    if (seen) return;
    openOnboardingModal(userId);
  }

  function bindOnboardingModal() {
    if (!shouldUseOnboardingModal()) return;
    const modal = getOnboardingModal();
    if (!modal) return;

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const closeTrigger = target.closest("[data-close-onboarding='true']");
      if (!closeTrigger) return;
      event.preventDefault();
      closeOnboardingModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) {
        closeOnboardingModal();
      }
    });
  }

  async function syncAuthUi() {
    if (!window.ClashlySession) return;

    const sessionState = await window.ClashlySession.resolveSession();
    const user = sessionState.user || null;
    if (window.ClasheCache) {
      window.ClasheCache.setActiveUserId(user ? user.id : "");
    }
    setLogoutVisibility(Boolean(user));

    if (!user) {
      stopNotificationWatcher();
      notificationsUserId = "";
      onboardingShownForUserId = "";
      closeOnboardingModal({ markSeen: false });
      updateNavNotificationBadges(false);
      return;
    }

    maybeShowOnboarding(user.id).catch(() => {});
    notificationsUserId = user.id;
    checkNavNotifications(user.id).catch(() => {});
    startNotificationWatcher(user.id);
  }

  function bindLogoutActions() {
    const logoutButtons = [document.getElementById("nav-logout-btn"), document.getElementById("logout-trigger")];
    logoutButtons.forEach((button) => {
      if (!button) return;
      button.addEventListener("click", handleLogout);
    });
  }

  function getCreateModalMarkup() {
    return `
      <div id="${CREATE_MODAL_ID}" class="composer-modal" hidden>
        <div class="composer-modal__backdrop" data-close-create-modal="true"></div>
        <section class="composer composer-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="create-modal-title">
          <header class="composer-head">
            <div class="composer-head__meta">
              <p class="composer-kicker">New take</p>
              <h2 id="create-modal-title" class="page-title">Drop your take</h2>
              <p class="composer-subtitle">Keep it sharp.</p>
            </div>
            <button type="button" class="modal-close-btn composer-modal__close" data-close-create-modal="true" aria-label="Close composer">
              <i class="app-icon fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </header>

          <div class="composer-layout">
            <form class="composer-form" id="create-modal-form" novalidate>
              <label for="create-modal-text" class="field-label">Your take</label>
              <textarea
                id="create-modal-text"
                class="take-textarea"
                name="take"
                rows="6"
                maxlength="180"
                placeholder="What's your take?"
              ></textarea>

              <p class="composer-note">Lead with a clear opinion. Up to 3 hashtags.</p>

              <div class="composer-media">
                <label class="field-label" id="create-modal-category-label">Category</label>
                <input type="hidden" id="create-modal-category" name="category" required value="" />
                <button
                  type="button"
                  class="category-picker-trigger"
                  id="create-modal-category-trigger"
                  aria-haspopup="dialog"
                  aria-expanded="false"
                  aria-labelledby="create-modal-category-label"
                >
                  <span class="category-picker-trigger__content">
                    <span class="category-picker-trigger__icon" aria-hidden="true">
                      <i class="app-icon fa-solid fa-list" aria-hidden="true"></i>
                    </span>
                    <span class="category-picker-trigger__text is-placeholder" id="create-modal-category-trigger-text">Select a category</span>
                  </span>
                  <span class="category-picker-trigger__chevron" aria-hidden="true">
                    <i class="app-icon fa-solid fa-chevron-down" aria-hidden="true"></i>
                  </span>
                </button>
                <p class="composer-hint">Choose one lane.</p>
              </div>

              <div class="composer-media">
                <p class="field-label">Optional images</p>
                <label for="create-modal-image" class="composer-upload">
                  <span class="composer-upload__icon" aria-hidden="true">
                    <i class="app-icon fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i>
                  </span>
                  <span class="composer-upload__copy">
                    <strong>Add images</strong>
                  </span>
                </label>
                <input
                  id="create-modal-image"
                  class="composer-upload__input"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  multiple
                />
                <p class="composer-hint">Up to 2 images.</p>
                <div class="image-preview-placeholder" id="create-modal-preview">${DEFAULT_PREVIEW_TEXT}</div>
              </div>

              <p id="create-modal-status" class="status-message" hidden></p>

              <footer class="composer-actions">
                <p class="char-count" id="create-modal-count">0 / 180</p>
                <button id="create-modal-submit" type="submit" class="btn btn--primary">Post Take</button>
              </footer>
            </form>

            <aside class="composer-side" aria-label="Posting guide">
              <section class="composer-detail">
                <h3 class="composer-detail__title">Shape the take</h3>
                <ul class="composer-detail__list">
                  <li><strong>State a position</strong><span>Make it easy to react to.</span></li>
                  <li><strong>Keep it singular</strong><span>One point lands better.</span></li>
                </ul>
              </section>

              <section class="composer-detail">
                <h3 class="composer-detail__title">Format rules</h3>
                <ul class="composer-detail__list">
                  <li><strong>180 characters</strong><span>Shorter is stronger.</span></li>
                  <li><strong>3 hashtags max</strong><span>Keep them focused.</span></li>
                  <li><strong>2 images max</strong><span>Use only if they help.</span></li>
                </ul>
              </section>
            </aside>
          </div>
        </section>
      </div>
    `;
  }

  function buildCreateModal() {
    if (!shouldUseCreateModal() || document.getElementById(CREATE_MODAL_ID)) return;
    document.body.insertAdjacentHTML("beforeend", getCreateModalMarkup());
  }

  function getCreateModalElements() {
    return {
      modal: document.getElementById(CREATE_MODAL_ID),
      form: document.getElementById("create-modal-form"),
      textarea: document.getElementById("create-modal-text"),
      count: document.getElementById("create-modal-count"),
      categorySelect: document.getElementById("create-modal-category"),
      imageInput: document.getElementById("create-modal-image"),
      preview: document.getElementById("create-modal-preview"),
      status: document.getElementById("create-modal-status"),
      submit: document.getElementById("create-modal-submit"),
    };
  }

  function getNotificationsDrawerMarkup() {
    return `
      <div id="${NOTIFICATIONS_DRAWER_ID}" class="notifications-drawer" hidden>
        <button type="button" class="notifications-drawer__backdrop" aria-label="Close notifications" data-close-notifications-drawer="true"></button>
        <section class="notifications-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="notifications-drawer-title">
          <header class="notifications-drawer__head">
            <h2 id="notifications-drawer-title" class="notifications-drawer__title">Notifications</h2>
            <button type="button" class="notifications-drawer__close" aria-label="Close notifications" data-close-notifications-drawer="true">
              <i class="app-icon fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </header>
          <p id="notifications-drawer-state" class="feed-state" hidden></p>
          <div id="notifications-drawer-list" class="notifications-drawer__list" aria-label="Notifications list"></div>
          <article id="notifications-drawer-empty" class="notification-empty" hidden>
            <p class="notification-empty__eyebrow">Quiet for now</p>
            <h3 class="notification-empty__title">Your notification floor is empty.</h3>
            <p class="notification-empty__text">Once people interact with your takes and profile, your stream will show up here.</p>
          </article>
        </section>
      </div>
    `;
  }

  function getNotificationsDrawerElements() {
    return {
      drawer: document.getElementById(NOTIFICATIONS_DRAWER_ID),
      state: document.getElementById("notifications-drawer-state"),
      list: document.getElementById("notifications-drawer-list"),
      empty: document.getElementById("notifications-drawer-empty"),
    };
  }

  function buildNotificationsDrawer() {
    if (!shouldUseNotificationsDrawer() || document.getElementById(NOTIFICATIONS_DRAWER_ID)) return;
    document.body.insertAdjacentHTML("beforeend", getNotificationsDrawerMarkup());
  }

  function setNotificationsDrawerState(message, type) {
    const { state } = getNotificationsDrawerElements();
    if (!state) return;

    state.hidden = !message;
    state.textContent = message || "";
    state.classList.remove("is-error", "is-success");
    if (type === "error") state.classList.add("is-error");
    if (type === "success") state.classList.add("is-success");
  }

  function renderNotificationAvatar(item) {
    const actor = item.actor || null;
    if (actor && actor.avatar_url) {
      return `<span class="notification-item__avatar"><img src="${window.ClashlyUtils.escapeHtml(actor.avatar_url)}" alt="@${window.ClashlyUtils.escapeHtml(
        actor.username || "user"
      )} avatar" loading="lazy" decoding="async" /></span>`;
    }

    const fallback = actor && actor.username ? window.ClashlyProfiles.initialsFromUsername(actor.username) : "CL";
    return `<span class="notification-item__avatar">${window.ClashlyUtils.escapeHtml(fallback)}</span>`;
  }

  function renderNotificationsDrawerList() {
    const { list, empty } = getNotificationsDrawerElements();
    if (!list || !empty) return;

    if (!notificationsItems.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.innerHTML = notificationsItems
      .map((item) => {
        const actorUsername = item.actor && item.actor.username ? String(item.actor.username) : "user";
        const time = window.ClashlyUtils.formatRelativeTime(item.created_at);
        const unreadClass = item.is_read ? "" : " is-unread";
        const snippet = item.snippet ? `<p class="notification-item__snippet">${window.ClashlyUtils.escapeHtml(item.snippet)}</p>` : "";

        return `
          <a
            class="notification-item${unreadClass}"
            href="${window.ClashlyUtils.escapeHtml(item.href)}"
            data-notification-id="${window.ClashlyUtils.escapeHtml(item.id)}"
          >
            ${renderNotificationAvatar(item)}
            <span class="notification-item__body">
              <span class="notification-item__message">${window.ClashlyUtils.escapeHtml(item.message)}</span>
              ${snippet}
              <span class="notification-item__meta">
                <span class="notification-item__actor">${window.ClashlyUtils.escapeHtml(actorUsername)}</span>
                <span class="notification-item__time">${window.ClashlyUtils.escapeHtml(time)}</span>
              </span>
            </span>
            <span class="notification-item__state" aria-hidden="true"></span>
          </a>
        `;
      })
      .join("");
  }

  async function markNotificationsDrawerRead(notificationIds) {
    if (!notificationsUserId || !window.ClashlyNotifications) return;
    const ids = Array.isArray(notificationIds) ? notificationIds : [];
    if (!ids.length) return;
    await window.ClashlyNotifications.markNotificationsRead(notificationsUserId, ids);
    notificationsItems = notificationsItems.map((item) => {
      if (!ids.includes(item.id)) return item;
      return { ...item, is_read: true };
    });
    renderNotificationsDrawerList();
  }

  async function loadNotificationsDrawer() {
    if (!window.ClashlySession || !window.ClashlyNotifications) return;

    setNotificationsDrawerState("Loading notifications...", "");
    const sessionState = await window.ClashlySession.resolveSession();
    notificationsUserId = sessionState.user ? sessionState.user.id : "";

    if (!notificationsUserId) {
      window.location.replace("auth.html");
      return;
    }

    const result = await window.ClashlyNotifications.fetchNotifications(notificationsUserId, { limit: 25 });
    if (result.error) {
      const message = window.ClashlyUtils.reportError(
        "Notifications drawer load failed.",
        result.error,
        "Could not load notifications."
      );
      setNotificationsDrawerState(message, "error");
      notificationsItems = [];
      renderNotificationsDrawerList();
      return;
    }

    notificationsItems = result.notifications || [];
    setNotificationsDrawerState("", "");
    renderNotificationsDrawerList();

    const unreadIds = notificationsItems.filter((item) => !item.is_read).map((item) => item.id);
    if (unreadIds.length) {
      window.setTimeout(() => {
        markNotificationsDrawerRead(unreadIds).catch(() => {});
        updateNavNotificationBadges(false);
      }, 180);
    } else {
      updateNavNotificationBadges(false);
    }
  }

  function openNotificationsDrawer() {
    const { drawer } = getNotificationsDrawerElements();
    if (!drawer) return;
    drawer.hidden = false;
    drawer.classList.add("is-open");
    document.body.classList.add("has-notifications-drawer-open");
    loadNotificationsDrawer().catch((error) => {
      const message = window.ClashlyUtils.reportError("Notifications drawer load failed.", error, "Could not load notifications.");
      setNotificationsDrawerState(message, "error");
    });
  }

  function closeNotificationsDrawer() {
    const { drawer } = getNotificationsDrawerElements();
    if (!drawer) return;
    drawer.classList.remove("is-open");
    document.body.classList.remove("has-notifications-drawer-open");
    window.setTimeout(() => {
      if (!drawer.classList.contains("is-open")) {
        drawer.hidden = true;
      }
    }, 260);
  }

  function bindNotificationsDrawer() {
    if (!shouldUseNotificationsDrawer()) return;
    const elements = getNotificationsDrawerElements();
    if (!elements.drawer || !elements.list) return;

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const openTrigger = target.closest("[data-open-notifications-drawer='true']");
      if (openTrigger && isDesktopViewport()) {
        event.preventDefault();
        openNotificationsDrawer();
        return;
      }

      const closeTrigger = target.closest("[data-close-notifications-drawer='true']");
      if (closeTrigger) {
        event.preventDefault();
        closeNotificationsDrawer();
        return;
      }

      const item = target.closest("#notifications-drawer-list [data-notification-id]");
      if (!item) return;

      const notificationId = item.getAttribute("data-notification-id") || "";
      if (!notificationId) return;
      markNotificationsDrawerRead([notificationId]).catch(() => {});
      closeNotificationsDrawer();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.drawer.hidden) {
        closeNotificationsDrawer();
      }
    });
  }

  let createStatusTimer = null;

  function setCreateStatus(message, type) {
    const { status } = getCreateModalElements();
    if (!status) return;

    if (createStatusTimer) { clearTimeout(createStatusTimer); createStatusTimer = null; }

    status.hidden = !message;
    status.textContent = message || "";
    status.classList.remove("is-error", "is-success");
    if (type === "error") status.classList.add("is-error");
    if (type === "success") status.classList.add("is-success");

    // Auto-dismiss success messages after 3 seconds
    if (type === "success" && message) {
      createStatusTimer = setTimeout(() => {
        status.hidden = true;
        status.textContent = "";
        status.classList.remove("is-error", "is-success");
        createStatusTimer = null;
      }, 3000);
    }
  }

  function updateCreateCount() {
    const { textarea, count } = getCreateModalElements();
    if (!textarea || !count || !window.ClashlyTakes) return;
    count.textContent = `${textarea.value.length} / ${window.ClashlyTakes.MAX_CONTENT_LENGTH}`;
  }

  function resetCreatePreview() {
    const { preview } = getCreateModalElements();
    if (!preview) return;
    const objectUrls = JSON.parse(preview.dataset.objectUrls || "[]");
    objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    delete preview.dataset.objectUrls;

    preview.classList.remove("has-image");
    preview.classList.remove("image-preview-placeholder--split");
    preview.textContent = DEFAULT_PREVIEW_TEXT;
  }

  function renderCreatePreview(files) {
    const { preview } = getCreateModalElements();
    if (!preview) return;

    const safeFiles = Array.from(files || []).filter(Boolean);
    if (!safeFiles.length) {
      resetCreatePreview();
      return;
    }

    const objectUrls = safeFiles.map((file) => URL.createObjectURL(file));
    preview.dataset.objectUrls = JSON.stringify(objectUrls);
    preview.classList.add("has-image");

    if (objectUrls.length === 1) {
      preview.classList.remove("image-preview-placeholder--split");
      preview.innerHTML = `<img src="${objectUrls[0]}" alt="Selected upload preview" />`;
      return;
    }

    preview.classList.add("image-preview-placeholder--split");
    preview.innerHTML = objectUrls
      .map(
        (objectUrl, index) => `
          <div class="image-preview-placeholder__slot">
            <img src="${objectUrl}" alt="Selected upload preview ${index + 1}" />
          </div>
        `
      )
      .join("");
  }

  function mergeSelectedFiles(existingFiles, incomingFiles, maxFiles) {
    const merged = [];
    const seenKeys = new Set();

    [...Array.from(existingFiles || []), ...Array.from(incomingFiles || [])].forEach((file) => {
      if (!file) return;
      const key = [file.name, file.size, file.lastModified].join(":");
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      merged.push(file);
    });

    return merged.slice(0, Math.max(0, Number(maxFiles || 0)) || 0);
  }

  function resetCreateForm() {
    const { form } = getCreateModalElements();
    if (!form) return;
    form.reset();
    if (createModalCategoryPicker) {
      createModalCategoryPicker.reset();
    }
    createModalSelectedFiles = [];
    resetCreatePreview();
    updateCreateCount();
    setCreateStatus("", "");
  }

  async function populateCreateCategories() {
    const { categorySelect } = getCreateModalElements();
    if (!categorySelect || categorySelect.tagName !== "SELECT" || !window.ClashlyCategories) return;

    categorySelect.innerHTML = `<option value="">Loading categories...</option>`;

    try {
      const result = await window.ClashlyCategories.fetchCategories();
      if (result.error) {
        throw result.error;
      }

      const categories = result.categories || [];
      if (!categories.length) {
        categorySelect.innerHTML = `<option value="">No categories available</option>`;
        return;
      }

      categorySelect.innerHTML = [
        `<option value="">Select category</option>`,
        ...categories.map(
          (category) =>
            `<option value="${window.ClashlyUtils.escapeHtml(category.slug)}">${window.ClashlyUtils.escapeHtml(
              category.name
            )}</option>`
        ),
      ].join("");
    } catch (error) {
      categorySelect.innerHTML = `<option value="">Could not load categories</option>`;
      setCreateStatus(window.ClashlyUtils.reportError("Create modal categories load failed.", error, "Could not load categories."), "error");
    }
  }

  function openCreateModal() {
    const { modal, textarea, categorySelect } = getCreateModalElements();
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";

    const trigger = document.getElementById("create-modal-category-trigger");
    const triggerText = document.getElementById("create-modal-category-trigger-text");
    if (!createModalCategoryPicker && window.ClasheCategoryModal && trigger && categorySelect) {
      createModalCategoryPicker = window.ClasheCategoryModal.bindCategoryPicker({
        triggerEl: trigger,
        inputEl: categorySelect,
        textEl: triggerText,
        onChange: () => setCreateStatus("", ""),
      });
    }

    window.setTimeout(() => {
      if (textarea) textarea.focus();
    }, 40);
  }

  function closeCreateModal() {
    const { modal } = getCreateModalElements();
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function bindCreateModal() {
    if (!shouldUseCreateModal()) return;
    const elements = getCreateModalElements();
    if (!elements.modal || !elements.form || !window.ClashlyTakes || !window.ClashlySession || !window.ClashlyCategories) return;

    updateCreateCount();

    const categoryTrigger = document.getElementById("create-modal-category-trigger");
    const categoryTriggerText = document.getElementById("create-modal-category-trigger-text");
    if (window.ClasheCategoryModal && typeof window.ClasheCategoryModal.bindCategoryPicker === "function" && categoryTrigger) {
      createModalCategoryPicker = window.ClasheCategoryModal.bindCategoryPicker({
        triggerEl: categoryTrigger,
        inputEl: elements.categorySelect,
        textEl: categoryTriggerText,
        onChange: () => setCreateStatus("", ""),
      });
    } else if (elements.categorySelect && elements.categorySelect.tagName === "SELECT") {
      populateCreateCategories();
    }

    elements.textarea.addEventListener("input", () => {
      setCreateStatus("", "");
      updateCreateCount();
    });

    elements.imageInput.addEventListener("change", () => {
      const files = Array.from(elements.imageInput.files || []).filter(Boolean);
      if (!files.length) {
        return;
      }

      const maxFiles = Number(window.ClashlyTakes.MAX_IMAGES_PER_TAKE || 2);
      const mergedFiles = mergeSelectedFiles(createModalSelectedFiles, files, maxFiles + files.length);
      const validation = window.ClashlyTakes.validateImageFiles(mergedFiles);
      if (!validation.valid) {
        elements.imageInput.value = "";
        setCreateStatus(validation.error, "error");
        return;
      }

      createModalSelectedFiles = mergedFiles;
      resetCreatePreview();
      renderCreatePreview(createModalSelectedFiles);
      elements.imageInput.value = "";
      setCreateStatus("", "");
    });

    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setCreateStatus("", "");

      const content = elements.textarea.value;
      const contentError = window.ClashlyTakes.validateTakeContent(content);
      if (contentError) {
        setCreateStatus(contentError, "error");
        return;
      }

      const categoryError = window.ClashlyTakes.validateCategory(elements.categorySelect.value);
      if (categoryError) {
        setCreateStatus(categoryError, "error");
        const trigger = document.getElementById("create-modal-category-trigger");
        if (trigger) trigger.focus();
        return;
      }

      const imageFiles = createModalSelectedFiles.slice();
      const imageValidation = window.ClashlyTakes.validateImageFiles(imageFiles);
      if (!imageValidation.valid) {
        setCreateStatus(imageValidation.error, "error");
        return;
      }

      const sessionState = await window.ClashlySession.resolveSession();
      if (!sessionState.user) {
        window.location.replace("auth.html");
        return;
      }

      // Close create modal and trigger the signature full-screen Clashe loader
      closeCreateModal();
      if (window.ClasheLoader && typeof window.ClasheLoader.show === "function") {
        window.ClasheLoader.show("create-take");
      }

      const postStartTime = Date.now();
      elements.submit.disabled = true;
      elements.submit.textContent = "Posting...";

      try {
        const createResult = await window.ClashlyTakes.createTake({
          userId: sessionState.user.id,
          content,
          categorySlug: elements.categorySelect.value,
          imageFiles,
        });

        if (createResult.error) {
          throw createResult.error;
        }

        resetCreateForm();
        setCreateStatus("", "");

        const newTake = createResult.take || null;
        if (newTake && (!newTake.profile || !newTake.profile.username) && window.ClashlyProfiles) {
          const authorId = newTake.user_id || sessionState.user.id;
          if (authorId && typeof window.ClashlyProfiles.getCachedProfileById === "function") {
            const cached = window.ClashlyProfiles.getCachedProfileById(authorId);
            if (cached && cached.username) {
              newTake.profile = {
                id: cached.id,
                username: cached.username,
                avatar_url: cached.avatar_url || "",
              };
            }
          }
        }

        // Notify active page (home feed, profile, etc.) to update with new take
        window.dispatchEvent(
          new CustomEvent(CREATE_EVENT, {
            detail: {
              take: newTake,
            },
          })
        );

        // Keep loader visible for a smooth, natural duration (~500ms)
        const elapsed = Date.now() - postStartTime;
        const waitMs = Math.max(0, 500 - elapsed);
        if (waitMs > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, waitMs));
        }

        // Release loader — user is back on the page they were on
        if (window.ClasheLoader && typeof window.ClasheLoader.hide === "function") {
          window.ClasheLoader.hide("create-take");
        }

        // Show clean monochrome toast
        if (window.ClashlyUtils && typeof window.ClashlyUtils.showToast === "function") {
          window.ClashlyUtils.showToast("Take posted", 2500);
        }
      } catch (error) {
        if (window.ClasheLoader && typeof window.ClasheLoader.hide === "function") {
          window.ClasheLoader.hide("create-take");
        }
        openCreateModal();
        const message = window.ClashlyUtils.reportError("Create modal post failed.", error, "Could not post take.");
        setCreateStatus(message, "error");
      } finally {
        elements.submit.disabled = false;
        elements.submit.textContent = "Post Take";
      }
    });

    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-open-create-modal='true']");
      if (trigger) {
        event.preventDefault();
        openCreateModal();
        return;
      }

      const closeTrigger = event.target.closest("[data-close-create-modal='true']");
      if (closeTrigger) {
        event.preventDefault();
        closeCreateModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.modal.hidden) {
        closeCreateModal();
      }
    });
  }

  function bindNavScrollSave() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest(".bottom-nav__link, .desktop-nav__link");
      if (!link) return;
      if (link.getAttribute("data-open-create-modal") === "true") return;
      if (link.getAttribute("data-open-notifications-drawer") === "true") return;

      // Tapping the tab you are already on scrolls smoothly to top instead of reloading the page
      if (link.classList.contains("is-active")) {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        return;
      }

      if (window.ClasheCache && page) {
        window.ClasheCache.saveScroll(page);
      }
    });
  }

  function boot() {
    initPwa();
    buildTopNav();
    buildBottomNav();
    buildLegalFooter();
    buildCreateModal();
    buildOnboardingModal();
    buildNotificationsDrawer();
    bindLogoutActions();
    bindCreateModal();
    bindOnboardingModal();
    bindNotificationsDrawer();
    bindNavScrollSave();
    syncAuthUi();
    window.addEventListener("clashly:auth-state", syncAuthUi);
    window.addEventListener("clashly:notifications-read", () => updateNavNotificationBadges(false));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && notificationsUserId) {
        refreshNotificationBanners(notificationsUserId);
      }
    });
    window.addEventListener("focus", () => {
      if (notificationsUserId) {
        refreshNotificationBanners(notificationsUserId);
      }
    });

    window.ClasheNav = {
      updateUnreadNotificationMarker: updateNavNotificationBadges,
      checkUnread: checkNavNotifications,
    };

    window.ClashlyApp = {
      page,
      openCreateModal,
      closeCreateModal,
      createEventName: CREATE_EVENT,
    };

    window.ClashlyPWA = {
      getState: getPwaState,
      subscribe: subscribePwaState,
      promptInstall: promptPwaInstall,
      registerServiceWorker,
      stateEventName: PWA_STATE_EVENT,
    };
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
