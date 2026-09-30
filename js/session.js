(function () {
  const PAGE_AUTH = "auth";
  const PAGE_PROFILE_SETUP = "profile-setup";
  let authSubscription = null;
  let guardInFlight = false;

  function safeRedirect(path) {
    const current = window.location.pathname.split("/").pop() || "index.html";
    if (current === path) return;
    window.location.replace(path);
  }

  async function resolveSession() {
    if (!window.ClashlySupabase || !window.ClashlySupabase.isConfigured()) {
      return { user: null, session: null, error: null };
    }

    if (!window.ClashlyAuth) {
      return { user: null, session: null, error: new Error("Auth service missing.") };
    }

    const { session, error } = await window.ClashlyAuth.getSession();
    return {
      user: session ? session.user : null,
      session,
      error,
    };
  }

  async function checkProfileCompletion(userId) {
    if (!window.ClashlyProfiles) {
      return { completed: false, error: new Error("Profile service missing.") };
    }

    return window.ClashlyProfiles.hasCompletedProfile(userId);
  }

  function getRouteContext() {
    return {
      page: document.body.dataset.page || "",
      requiresAuth: document.body.dataset.requiresAuth === "true",
      requiresProfile: document.body.dataset.requiresProfile === "true",
    };
  }

  async function resolveRedirectForAuthenticatedUser(userId, context) {
    const profileCheck = await checkProfileCompletion(userId);
    if (profileCheck.error) {
      console.error("[Clashly] Unable to verify profile setup.", profileCheck.error);
      return;
    }

    if (context.page === PAGE_AUTH) {
      safeRedirect(profileCheck.completed ? "index.html" : "profile-setup.html");
      return;
    }

    if (context.page === PAGE_PROFILE_SETUP) {
      if (profileCheck.completed) safeRedirect("index.html");
      return;
    }

    if (context.requiresProfile && !profileCheck.completed) {
      safeRedirect("profile-setup.html");
    }
  }

  async function guardRoute() {
    if (guardInFlight) return;
    guardInFlight = true;

    try {
      const context = getRouteContext();
      if (!window.ClashlySupabase || !window.ClashlySupabase.isConfigured()) {
        return;
      }

      const sessionState = await resolveSession();
      const user = sessionState.user;

      if (window.ClasheCache) {
        const prevUserId = window.ClasheCache.getActiveUserId();
        const currentId = user ? user.id : "";
        if (prevUserId && currentId && prevUserId !== currentId) {
          window.ClasheCache.clearAll();
          if (window.ClashlyTakeRenderer && typeof window.ClashlyTakeRenderer.clearCache === "function") {
            window.ClashlyTakeRenderer.clearCache();
          }
          if (window.ClashlyProfiles && typeof window.ClashlyProfiles.clearProfileCache === "function") {
            window.ClashlyProfiles.clearProfileCache();
          }
        }
        window.ClasheCache.setActiveUserId(currentId);
      }

      if (!user) {
        if (context.page === PAGE_AUTH) return;
        if (context.requiresAuth) safeRedirect("auth.html");
        return;
      }

      await resolveRedirectForAuthenticatedUser(user.id, context);
    } finally {
      guardInFlight = false;
      if (window.ClasheLoader) {
        window.ClasheLoader.release("route-guard");
      }
    }
  }

  async function handleAuthStateChange(event, session) {
    const context = getRouteContext();

    if (event === "SIGNED_OUT") {
      if (window.ClasheCache) {
        window.ClasheCache.clearAll();
      }
      if (window.ClashlyTakeRenderer && typeof window.ClashlyTakeRenderer.clearCache === "function") {
        window.ClashlyTakeRenderer.clearCache();
      }
      if (window.ClashlyProfiles && typeof window.ClashlyProfiles.clearProfileCache === "function") {
        window.ClashlyProfiles.clearProfileCache();
      }
      if (context.requiresAuth) {
        safeRedirect("auth.html");
      }
      return;
    }

    const user = session && session.user ? session.user : null;
    if (user && window.ClasheCache) {
      const prevUserId = window.ClasheCache.getActiveUserId();
      if (prevUserId && prevUserId !== user.id) {
        window.ClasheCache.clearAll();
        if (window.ClashlyTakeRenderer && typeof window.ClashlyTakeRenderer.clearCache === "function") {
          window.ClashlyTakeRenderer.clearCache();
        }
        if (window.ClashlyProfiles && typeof window.ClashlyProfiles.clearProfileCache === "function") {
          window.ClashlyProfiles.clearProfileCache();
        }
      }
      window.ClasheCache.setActiveUserId(user.id);
    }
    if (!user) return;
    await resolveRedirectForAuthenticatedUser(user.id, context);
  }

  function bindAuthStateListener() {
    if (!window.ClashlyAuth || !window.ClashlySupabase || !window.ClashlySupabase.isConfigured()) return;
    if (authSubscription) return;

    const { data } = window.ClashlyAuth.onAuthStateChange((event, session) => {
      // Avoid awaiting Supabase work inside the auth callback.
      window.setTimeout(() => {
        handleAuthStateChange(event, session).catch((error) => {
          console.error("[Clashly] Auth state handling failed.", error);
        });

        window.dispatchEvent(
          new CustomEvent("clashly:auth-state", {
            detail: {
              event,
              user: session && session.user ? session.user : null,
            },
          })
        );
      }, 0);
    });

    authSubscription = data && data.subscription ? data.subscription : null;
  }

  function bootSession() {
    bindAuthStateListener();
    const page = document.body.dataset.page || "";
    if (!page) return;
    guardRoute();
  }

  window.ClashlySession = {
    guardRoute,
    resolveSession,
  };

  document.addEventListener("DOMContentLoaded", bootSession);
})();
